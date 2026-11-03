// Actual application storage/core source, transpiled in memory; SQLite runs on Node, not iOS.
const fs=require('node:fs');
const path=require('node:path');
const Module=require('node:module');
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const root=path.resolve(__dirname,'../../../..');
const ts=require(path.join(root,'node_modules/typescript'));
const originalLoad=Module._load;
const originalTS=require.extensions['.ts'];
let activeDatabase;
require.extensions['.ts']=(module,filename)=>{
  const output=ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
  module._compile(output,filename);
};
Module._load=function(name,...args){return name==='expo-sqlite'?{openDatabaseAsync:async()=>activeDatabase}:originalLoad.call(this,name,...args);};
const storage=require(path.join(root,'src/storage.ts'));
const core=require(path.join(root,'src/core.ts'));
Module._load=originalLoad;
if(originalTS)require.extensions['.ts']=originalTS;else delete require.extensions['.ts'];
function adapter(raw){return {
 execAsync:async sql=>raw.exec(sql),
 runAsync:async(sql,...args)=>raw.prepare(sql).run(...args),
 getFirstAsync:async(sql,...args)=>raw.prepare(sql).get(...args)??null,
 getAllAsync:async(sql,...args)=>raw.prepare(sql).all(...args),
 withExclusiveTransactionAsync:async fn=>{raw.exec('BEGIN');try{await fn(adapter(raw));raw.exec('COMMIT');}catch(e){raw.exec('ROLLBACK');throw e;}},
};}
(async()=>{
 const raw=new DatabaseSync(':memory:');activeDatabase=adapter(raw);
 try{
  const db=await storage.openStorage();
  const first=await storage.readAll(db);
  assert.equal(first.notes.length,0);assert.equal(first.cards.length,0);assert.equal(first.reviews.length,0);
  console.log('Current bootstrap remains empty:',JSON.stringify({notes:first.notes.length,cards:first.cards.length,reviews:first.reviews.length,titles:first.notes.map(n=>n.title)}));
  await db.runAsync('DELETE FROM notes');
  for(let i=0;i<9;i++)await storage.saveNoteAndCards(db,{id:`n${i}`,title:`ملاحظة ${i}`,body:'ع'.repeat(999990),createdAt:1,updatedAt:1},[]);
  const all=await storage.readAll(db);const backup=storage.makeBackup(all.notes,all.cards,all.reviews);
  assert.equal(core.validateBackup(backup),true);
  const bytes=core.utf8ByteLength(JSON.stringify(backup,null,2));assert.ok(bytes>core.MAX_BACKUP_BYTES);
  assert.throws(()=>core.serializeBackup(backup),/15/);
  await assert.rejects(storage.restoreBackup(db,storage.makeBackup([],[],[])),/نقطة رجوع/);
  assert.equal((await storage.readAll(db)).notes.length,9);
  console.log('D002 REPRODUCED: individually allowed notes save successfully but export and protected replacement fail',JSON.stringify({notes:all.notes.length,charsPerNote:all.notes[0].body.length,serializedUTF8Bytes:bytes,backupLimitBytes:core.MAX_BACKUP_BYTES,preservedAfterRejectedRestore:true}));
 }finally{raw.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
