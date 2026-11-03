// Use the actual helper with Expo API adapters backed by Node SQLite and disk files.
// This verifies the copy/verification workflow, not Expo's iPhone implementation.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {tmpdir}=require('node:os');
const {fileURLToPath,pathToFileURL}=require('node:url');
const {DatabaseSync,backup}=require('node:sqlite');
const Module=require('node:module');
const ts=require('typescript');
let mode={},opened=[],deleted=[],backupCalls=0;
const localPath=value=>value.startsWith('file://')?fileURLToPath(value):value;
class File {
  constructor(...parts){this.path=path.join(...parts.map(value=>localPath(typeof value==='string'?value:value.uri)));this.uri=pathToFileURL(this.path).href;}
  get name(){return path.basename(this.path);}
  get exists(){return fs.existsSync(this.path);}
  get size(){return this.exists?fs.statSync(this.path).size:0;}
  create(){fs.writeFileSync(this.path,'',{flag:'wx'});}
}
function adapter(raw,databasePath,isDestination=false){return {
  raw,databasePath,closed:false,
  execAsync:async sql=>{if(!isDestination)throw new Error('source must remain read-only');raw.exec(sql);},
  getFirstAsync:async(sql,...args)=>{
    if(isDestination&&mode.integrityFailure&&sql.startsWith('PRAGMA integrity_check'))return {integrity_check:'injected corruption'};
    if(mode.oversizeSource&&!isDestination&&sql==='PRAGMA page_count')return {page_count:200000};
    if(mode.oversizeDestination&&isDestination&&sql==='PRAGMA page_count')return {page_count:200000};
    return raw.prepare(sql).get(...args)??null;
  },
  getAllAsync:async(sql,...args)=>raw.prepare(sql).all(...args),
  async closeAsync(){if(this.closed)throw new Error('already closed');raw.close();this.closed=true;},
};}
const sqlite={
  async openDatabaseAsync(name,options,directory){
    assert.equal(options.useNewConnection,true);
    const target=path.join(localPath(directory),name);
    const db=adapter(new DatabaseSync(target),pathToFileURL(target).href,true);opened.push(db);return db;
  },
  async backupDatabaseAsync({sourceDatabase,destDatabase}){
    backupCalls++;
    if(mode.backupFailure)throw new Error('injected backup failure');
    await backup(sourceDatabase.raw,localPath(destDatabase.databasePath));
  },
  async deleteDatabaseAsync(name,directory){
    deleted.push(name);
    for(const suffix of ['','-wal','-shm'])fs.rmSync(path.join(localPath(directory),name)+suffix,{force:true});
  },
};
const modulePath=path.resolve(__dirname,'../src/databaseSnapshot.ts');
const helperModule=new Module(modulePath,module);
helperModule.filename=modulePath;helperModule.paths=Module._nodeModulePaths(path.dirname(modulePath));
const originalLoad=Module._load;
try{
  Module._load=function(name,...args){return name==='expo-sqlite'?sqlite:name==='expo-file-system'?{File}:originalLoad.call(this,name,...args);};
  helperModule._compile(ts.transpileModule(fs.readFileSync(modulePath,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,modulePath);
}finally{Module._load=originalLoad;}
const {createDatabaseSnapshot,MAX_DATABASE_SNAPSHOT_BYTES}=helperModule.exports;
function fixture(large=false){
  mode={};opened=[];deleted=[];backupCalls=0;
  const directory=fs.mkdtempSync(path.join(tmpdir(),'rusukh-native-rescue-'));
  const sourcePath=path.join(directory,'live.db');
  const raw=new DatabaseSync(sourcePath);
  raw.exec(`PRAGMA journal_mode=WAL;PRAGMA wal_autocheckpoint=0;PRAGMA foreign_keys=ON;
    CREATE TABLE notes(id TEXT PRIMARY KEY,title TEXT,body TEXT,createdAt INTEGER,updatedAt INTEGER);
    CREATE TABLE cards(id TEXT PRIMARY KEY,noteId TEXT REFERENCES notes(id) ON DELETE CASCADE,question TEXT,answer TEXT,dueAt INTEGER,intervalDays INTEGER,ease REAL,repetitions INTEGER,updatedAt INTEGER);
    CREATE TABLE reviews(id TEXT PRIMARY KEY,cardId TEXT REFERENCES cards(id) ON DELETE CASCADE,grade TEXT,reviewedAt INTEGER);
    CREATE TABLE meta(key TEXT PRIMARY KEY,value TEXT);
    CREATE TABLE study_recovery_v1(id INTEGER PRIMARY KEY,schemaVersion INTEGER,createdAt INTEGER,reason TEXT,noteCount INTEGER,cardCount INTEGER,reviewCount INTEGER,bytes INTEGER,payload TEXT);`);
  const insert=raw.prepare('INSERT INTO notes VALUES(?,?,?,?,?)');
  for(let i=0;i<(large?9:1);i++)insert.run(`n${i}`,`درس ${i}`,large?'ع'.repeat(999990):'محتوى محفوظ',1,2);
  raw.prepare('INSERT INTO cards VALUES(?,?,?,?,?,?,?,?,?)').run('c1','n0','سؤال','جواب',100,3,2.5,2,1);
  raw.prepare('INSERT INTO reviews VALUES(?,?,?,?)').run('r1','c1','good',1);
  raw.prepare('INSERT INTO meta VALUES(?,?)').run('noteDraft.v1',JSON.stringify({version:1,editingId:null,title:'مسودة',body:'نص غير منشور',updatedAt:1}));
  raw.prepare('INSERT INTO meta VALUES(?,?)').run('darkMode','true');
  raw.prepare('INSERT INTO meta VALUES(?,?)').run('workspace.v1','{"version":1,"density":"compact","modules":[]}');
  raw.prepare('INSERT INTO study_recovery_v1 VALUES(?,?,?,?,?,?,?,?,?)').run(1,1,1,'before-import',0,0,0,2,'{}');
  const source=adapter(raw,pathToFileURL(sourcePath).href);
  const snapshot=db=>Object.fromEntries(['notes','cards','reviews','meta','study_recovery_v1'].map(table=>[table,db.prepare(`SELECT * FROM ${table} ORDER BY ${table==='meta'?'key':'id'}`).all()]));
  return {raw,source,directory,uri:pathToFileURL(directory).href,snapshot,
    cleanup(){if(!source.closed)raw.close();for(const dest of opened)if(!dest.closed)dest.raw.close();fs.rmSync(directory,{recursive:true,force:true});}};
}

test('oversize JSON library gets a self-contained SQLite rescue copy including committed WAL, drafts and recovery',async()=>{
  const f=fixture(true);
  try{
    const before=f.snapshot(f.raw);
    const result=await createDatabaseSnapshot(f.source,f.uri);
    assert.equal(result.notes,9);assert.equal(result.cards,1);assert.equal(result.reviews,1);
    assert.equal(result.recoveryPoints,1);assert.equal(result.hasDraft,true);
    assert.ok(result.bytes>15*1024*1024);assert.ok(result.bytes<=MAX_DATABASE_SNAPSHOT_BYTES);
    assert.equal(result.bytes,fs.statSync(fileURLToPath(result.uri)).size);
    assert.equal(f.source.closed,false);assert.equal(opened.length,1);assert.equal(opened[0].closed,true);
    assert.equal(fs.existsSync(fileURLToPath(result.uri)+'-wal'),false);
    const recovered=new DatabaseSync(fileURLToPath(result.uri),{readOnly:true});
    try{
      assert.deepEqual(f.snapshot(recovered),before);
      assert.equal(recovered.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
      assert.deepEqual(recovered.prepare('PRAGMA foreign_key_check').all(),[]);
    }finally{recovered.close();}
    assert.deepEqual(f.snapshot(f.raw),before);
    assert.equal(f.raw.prepare('PRAGMA journal_mode').get().journal_mode,'wal');
    console.log('D002 rescue verified on Node SQLite:',JSON.stringify({notes:result.notes,bytes:result.bytes,includesDraft:result.hasDraft,recoveryPoints:result.recoveryPoints,sourceStillOpen:!f.source.closed}));
  }finally{f.cleanup();}
});

test('backup and integrity failures never report a file, close the live database or alter source rows',async()=>{
  for(const failure of ['backupFailure','integrityFailure']){
    const f=fixture();
    try{
      const before=f.snapshot(f.raw);mode[failure]=true;
      await assert.rejects(createDatabaseSnapshot(f.source,f.uri));
      assert.equal(f.source.closed,false);assert.deepEqual(f.snapshot(f.raw),before);
      assert.equal(opened[0].closed,true);assert.equal(deleted.length,1);
      assert.equal(fs.existsSync(localPath(opened[0].databasePath)),false);
    }finally{f.cleanup();}
  }
});

test('foreign-key violations in the copied database prevent a success result without editing the source',async()=>{
  const f=fixture();
  try{
    f.raw.exec('PRAGMA foreign_keys=OFF');
    f.raw.prepare('INSERT INTO reviews VALUES(?,?,?,?)').run('orphan','missing','good',2);
    const before=f.snapshot(f.raw);
    await assert.rejects(createDatabaseSnapshot(f.source,f.uri),/روابط|علاقات|سلامة/);
    assert.deepEqual(f.snapshot(f.raw),before);assert.equal(f.source.closed,false);assert.equal(deleted.length,1);
  }finally{f.cleanup();}
});

test('size is bounded before allocation and checked again after native copying',async()=>{
  for(const phase of ['oversizeSource','oversizeDestination']){
    const f=fixture();
    try{
      mode[phase]=true;
      await assert.rejects(createDatabaseSnapshot(f.source,f.uri),/512/);
      assert.equal(f.source.closed,false);
      assert.equal(backupCalls,phase==='oversizeSource'?0:1);
      if(phase==='oversizeSource'){assert.equal(opened.length,0);assert.equal(deleted.length,0);}
      else{assert.equal(opened[0].closed,true);assert.equal(deleted.length,1);}
    }finally{f.cleanup();}
  }
});

test('destination name collision and non-local directories cannot overwrite an existing file',async()=>{
  const f=fixture();const oldNow=Date.now,oldRandom=Math.random;
  try{
    await assert.rejects(createDatabaseSnapshot(f.source,'content://external-directory'));
    Date.now=()=>123;Math.random=()=>0.5;
    const name=`rusukh-rescue-123-${(0.5).toString(36).slice(2,11)}.sqlite`;
    const previous=path.join(f.directory,name);fs.writeFileSync(previous,'keep existing');
    await assert.rejects(createDatabaseSnapshot(f.source,f.uri));
    assert.equal(fs.readFileSync(previous,'utf8'),'keep existing');assert.equal(opened.length,0);assert.equal(deleted.length,0);
  }finally{Date.now=oldNow;Math.random=oldRandom;f.cleanup();}
});
