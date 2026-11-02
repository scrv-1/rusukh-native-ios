// Execute the app's SQL against a real SQLite database on Node, not an iPhone.
const test = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const { mkdtempSync, rmSync } = require('node:fs');
const { join } = require('node:path');
const { tmpdir } = require('node:os');
const Module = require('node:module');
const originalLoad = Module._load;
Module._load = function(name,...rest) { return name === 'expo-sqlite' ? {} : originalLoad.call(this,name,...rest); };
const { saveNoteAndCards, saveNote, saveCard, readAll, setSetting, getSetting, makeBackup, restoreBackup } = require('../.test-build/storage.js');
Module._load = originalLoad;
const { defaultWorkspace, toggleModule, readWorkspace, WORKSPACE_KEY } = require('../.test-build/workspace.js');
const { graphEdges } = require('../.test-build/core.js');
function adapter(raw) { return {
  runAsync: async(sql,...args)=>raw.prepare(sql).run(...args),
  getFirstAsync: async(sql,...args)=>raw.prepare(sql).get(...args) ?? null,
  getAllAsync: async(sql,...args)=>raw.prepare(sql).all(...args),
  withExclusiveTransactionAsync: async fn=>{ raw.exec('BEGIN'); try {await fn(adapter(raw));raw.exec('COMMIT');}catch(e){raw.exec('ROLLBACK');throw e;} },
}; }
function schema(raw) { raw.exec(`PRAGMA foreign_keys=ON;
CREATE TABLE notes(id TEXT PRIMARY KEY,title TEXT,body TEXT,createdAt INTEGER,updatedAt INTEGER);
CREATE TABLE cards(id TEXT PRIMARY KEY,noteId TEXT REFERENCES notes(id) ON DELETE CASCADE,question TEXT,answer TEXT,dueAt INTEGER,intervalDays INTEGER,ease REAL,repetitions INTEGER,updatedAt INTEGER);
CREATE TABLE reviews(id TEXT PRIMARY KEY,cardId TEXT REFERENCES cards(id) ON DELETE CASCADE,grade TEXT,reviewedAt INTEGER);
CREATE TABLE meta(key TEXT PRIMARY KEY,value TEXT);`); }
test('preferences persist after SQLite reopen; hide and reset preserve study content', async()=>{
  const dir=mkdtempSync(join(tmpdir(),'rusukh-workspace-')); const path=join(dir,'test.db');
  let raw=new DatabaseSync(path);
  try {
    schema(raw); let db=adapter(raw);
    await saveNote(db,{id:'n1',title:'درس',body:'[[علاقة]]',createdAt:1,updatedAt:2});
    await saveCard(db,{id:'c1',noteId:'n1',question:'س؟',answer:'ج',dueAt:1,intervalDays:0,ease:2.5,repetitions:0,updatedAt:1});
    const before=await readAll(db);
    const hidden=toggleModule(defaultWorkspace(),'notes');
    await setSetting(db,WORKSPACE_KEY,JSON.stringify(hidden)); raw.close();
    raw=new DatabaseSync(path); db=adapter(raw);
    assert.deepEqual(readWorkspace(await getSetting(db,WORKSPACE_KEY)),hidden);
    assert.deepEqual(await readAll(db),before);
    await setSetting(db,WORKSPACE_KEY,JSON.stringify(defaultWorkspace()));
    assert.deepEqual(await readAll(db),before);
    await restoreBackup(db,makeBackup(before.notes,before.cards,before.reviews));
    assert.deepEqual(await readAll(db),before);
    assert.deepEqual(readWorkspace(await getSetting(db,WORKSPACE_KEY)),defaultWorkspace());
  } finally {raw.close();rmSync(dir,{recursive:true});}
});
test('rejected import leaves existing notes and workspace untouched', async()=>{
  const raw=new DatabaseSync(':memory:');schema(raw);const db=adapter(raw);
  try {
    await saveNote(db,{id:'n1',title:'محفوظ',body:'بيانات',createdAt:1,updatedAt:1});
    await setSetting(db,WORKSPACE_KEY,JSON.stringify(defaultWorkspace()));
    const before=await readAll(db);
    await assert.rejects(restoreBackup(db,{format:'rusukh-backup',version:99}));
    for(const change of [{id:''},{id:'n'.repeat(201)},{title:'ع'.repeat(161)}]) {
      const incompatible=makeBackup([{...before.notes[0],...change}],[],[]);
      await assert.rejects(restoreBackup(db,incompatible));
      assert.deepEqual(await readAll(db),before);
    }
    assert.deepEqual(await readAll(db),before);
    assert.deepEqual(readWorkspace(await getSetting(db,WORKSPACE_KEY)),defaultWorkspace());
  } finally {raw.close();}
});
test('failure while creating cards rolls back the note and every previous card', async()=>{
  const raw=new DatabaseSync(':memory:');schema(raw);const db=adapter(raw);
  raw.exec("CREATE TRIGGER fail_card BEFORE INSERT ON cards WHEN NEW.id='fail' BEGIN SELECT RAISE(ABORT,'simulated disk failure'); END;");
  try {
    const note={id:'n1',title:'قبل',body:'محتوى محفوظ',createdAt:1,updatedAt:1};
    await saveNote(db,note);
    const before=await readAll(db);
    const card={id:'first',noteId:'n1',question:'س',answer:'ج',dueAt:1,intervalDays:0,ease:2.5,repetitions:0,updatedAt:1};
    await assert.rejects(saveNoteAndCards(db,{...note,title:'بعد'},[card,{...card,id:'fail'}]));
    assert.deepEqual(await readAll(db),before);
    await saveNoteAndCards(db,{...note,title:'بعد'},[card]);
    const after=await readAll(db);
    assert.equal(after.notes[0].title,'بعد');assert.equal(after.cards.length,1);
  } finally {raw.close();}
});

test('renaming a note preserves incoming graph links, aliases and unrelated text atomically', async()=>{
  const raw=new DatabaseSync(':memory:');schema(raw);const db=adapter(raw);
  try {
    const target={id:'target',title:'ملف (A)+',body:'قبل',createdAt:1,updatedAt:1};
    const linked={id:'linked',title:'الرابط',body:'بداية [[  ملف   (a)+  |اسم ثابت]] ثم [[ملف (A)+]] ونص ملف (A)+ و[[ملف (A)+ آخر]] نهاية',createdAt:1,updatedAt:2};
    const other={id:'other',title:'غير مرتبط',body:'[[ملف (A)+ آخر]] و [ملف (A)+] ونص عادي',createdAt:1,updatedAt:3};
    for(const n of [target,linked,other]) await saveNote(db,n);
    assert.deepEqual(graphEdges((await readAll(db)).notes),[{from:'linked',to:'target'}]);
    await saveNoteAndCards(db,{...target,title:'درس $& جديد',body:'تمرير [[ملف (A)+|ذاتي]]',updatedAt:10},[]);
    const after=await readAll(db);const byId=Object.fromEntries(after.notes.map(n=>[n.id,n]));
    assert.equal(byId.linked.body,'بداية [[درس $& جديد|اسم ثابت]] ثم [[درس $& جديد]] ونص ملف (A)+ و[[ملف (A)+ آخر]] نهاية');
    assert.equal(byId.linked.updatedAt,10);
    assert.equal(byId.target.body,'تمرير [[درس $& جديد|ذاتي]]');
    assert.deepEqual({...byId.other},other);
    assert.deepEqual(graphEdges(after.notes),[{from:'linked',to:'target'}]);
  } finally { raw.close(); }
});

test('card insertion failure rolls back renamed title and all rewritten backlinks', async()=>{
  const raw=new DatabaseSync(':memory:');schema(raw);const db=adapter(raw);
  raw.exec("CREATE TRIGGER fail_rename_card BEFORE INSERT ON cards BEGIN SELECT RAISE(ABORT,'simulated insert failure'); END;");
  try {
    const target={id:'target',title:'قديم',body:'[[قديم]]',createdAt:1,updatedAt:1};
    await saveNote(db,target);
    await saveNote(db,{id:'linked',title:'رابط',body:'[[قديم|اسم]]',createdAt:1,updatedAt:2});
    const before=await readAll(db);
    const card={id:'failed',noteId:'target',question:'س',answer:'ج',dueAt:1,intervalDays:0,ease:2.5,repetitions:0,updatedAt:1};
    await assert.rejects(saveNoteAndCards(db,{...target,title:'جديد',updatedAt:10},[card]));
    assert.deepEqual(await readAll(db),before);
  } finally { raw.close(); }
});

test('renaming refuses oversized rewritten content without changing any note', async()=>{
  const raw=new DatabaseSync(':memory:');schema(raw);const db=adapter(raw);
  try {
    const target={id:'target',title:'أ',body:'',createdAt:1,updatedAt:1};
    await saveNote(db,target);
    await saveNote(db,{id:'linked',title:'الرابط',body:'x'.repeat(999995)+'[[أ]]',createdAt:1,updatedAt:2});
    const before=await readAll(db);
    await assert.rejects(saveNoteAndCards(db,{...target,title:'عنوان أطول',updatedAt:10},[]),/طويل/);
    assert.deepEqual(await readAll(db),before);
  } finally { raw.close(); }
});

test('renaming to an unrepresentable wiki target never corrupts existing links', async()=>{
  const raw=new DatabaseSync(':memory:');schema(raw);const db=adapter(raw);
  try {
    const target={id:'target',title:'قديم',body:'',createdAt:1,updatedAt:1};
    await saveNote(db,target);
    await saveNote(db,{id:'linked',title:'رابط',body:'[[قديم|وصف]]',createdAt:1,updatedAt:2});
    const before=await readAll(db);
    for(const title of ['جديد]]','جديد|جزء','سطر\nجديد']) {
      await assert.rejects(saveNoteAndCards(db,{...target,title,updatedAt:10},[]),/محارف/);
      assert.deepEqual(await readAll(db),before);
    }
  } finally { raw.close(); }
});
