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
