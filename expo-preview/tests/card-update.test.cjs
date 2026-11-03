// Exercise text-only card edits against real Node SQLite; native iOS is not simulated.
const test = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const Module = require('node:module');
const originalLoad = Module._load;
let updateCard;
try {
  Module._load = function (name, ...rest) { return name === 'expo-sqlite' ? {} : originalLoad.call(this, name, ...rest); };
  ({ updateCard } = require('../.test-build/storage.js'));
} finally { Module._load = originalLoad; }
function adapter(raw) { return {
  runAsync: async (sql, ...args) => raw.prepare(sql).run(...args),
  getFirstAsync: async (sql, ...args) => raw.prepare(sql).get(...args) ?? null,
  getAllAsync: async (sql, ...args) => raw.prepare(sql).all(...args),
  withExclusiveTransactionAsync: async work => {
    raw.exec('BEGIN IMMEDIATE');
    try { await work(adapter(raw)); raw.exec('COMMIT'); }
    catch (error) { raw.exec('ROLLBACK'); throw error; }
  },
}; }
function fixture() {
  const raw = new DatabaseSync(':memory:');
  raw.exec(`PRAGMA foreign_keys=ON;
    CREATE TABLE notes(id TEXT PRIMARY KEY,title TEXT,body TEXT,createdAt INTEGER,updatedAt INTEGER);
    CREATE TABLE cards(id TEXT PRIMARY KEY,noteId TEXT REFERENCES notes(id) ON DELETE CASCADE,question TEXT,answer TEXT,
      dueAt INTEGER,intervalDays INTEGER,ease REAL,repetitions INTEGER,updatedAt INTEGER);
    CREATE TABLE reviews(id TEXT PRIMARY KEY,cardId TEXT REFERENCES cards(id) ON DELETE CASCADE,grade TEXT,reviewedAt INTEGER);
    CREATE TABLE meta(key TEXT PRIMARY KEY,value TEXT);`);
  raw.prepare('INSERT INTO notes VALUES(?,?,?,?,?)').run('n1','ملاحظة','المحتوى الأصلي',1,2);
  raw.prepare('INSERT INTO notes VALUES(?,?,?,?,?)').run('n2','ملاحظة أخرى','نص آخر',1,2);
  const card = {id:'c1',noteId:'n1',question:'سؤال قديم',answer:'جواب قديم',dueAt:1999999999999,intervalDays:42,ease:2.15,repetitions:8,updatedAt:3};
  raw.prepare('INSERT INTO cards VALUES(?,?,?,?,?,?,?,?,?)').run(...Object.values(card));
  raw.prepare('INSERT INTO reviews VALUES(?,?,?,?)').run('r1','c1','good',100);
  raw.prepare('INSERT INTO reviews VALUES(?,?,?,?)').run('r2','c1','hard',200);
  const snapshot = () => ({
    notes:raw.prepare('SELECT * FROM notes ORDER BY id').all(),
    cards:raw.prepare('SELECT * FROM cards ORDER BY id').all(),
    reviews:raw.prepare('SELECT * FROM reviews ORDER BY id').all(),
  });
  return {raw,db:adapter(raw),card,snapshot};
}

test('updateCard changes only text and updatedAt, preserving schedule, ownership and review history', async () => {
  const f=fixture();
  try {
    const before=f.snapshot();
    await updateCard(f.db,'c1',{question:'  سؤال مصحح  ',answer:'  جواب مصحح  ',noteId:'n2',dueAt:0});
    const after=f.snapshot();
    const card=after.cards[0];
    assert.equal(card.question,'سؤال مصحح');assert.equal(card.answer,'جواب مصحح');assert.ok(card.updatedAt>3);
    assert.deepEqual({...card,question:f.card.question,answer:f.card.answer,updatedAt:f.card.updatedAt},f.card);
    assert.deepEqual(after.notes,before.notes);assert.deepEqual(after.reviews,before.reviews);
    assert.deepEqual(f.raw.prepare('PRAGMA foreign_key_check').all(),[]);
  } finally {f.raw.close();}
});

test('updateCard rejects absent cards and invalid text without changing any existing row', async () => {
  const f=fixture();
  try {
    const before=f.snapshot();
    for(const input of [null,{}, {question:' ',answer:'جواب'}, {question:'سؤال',answer:'\n'},
      {question:4,answer:'جواب'}, {question:'س'.repeat(1000001),answer:'جواب'}, {question:'سؤال',answer:'ج'.repeat(1000001)}]) {
      await assert.rejects(updateCard(f.db,'c1',input));assert.deepEqual(f.snapshot(),before);
    }
    await assert.rejects(updateCard(f.db,'missing',{question:'سؤال',answer:'جواب'}),/موجودة/);
    assert.deepEqual(f.snapshot(),before);
  } finally {f.raw.close();}
});

test('duplicate questions are rejected within the same note but allowed in another note', async () => {
  const f=fixture();
  try {
    const insert=f.raw.prepare('INSERT INTO cards VALUES(?,?,?,?,?,?,?,?,?)');
    insert.run('c2','n1','  SAME   QUESTION ','different',1,0,2.5,0,1);
    insert.run('c3','n2','سؤال في ملاحظة ثانية','different',1,0,2.5,0,1);
    const before=f.snapshot();
    await assert.rejects(updateCard(f.db,'c1',{question:'same question',answer:'جواب'}),/مكرر/);
    assert.deepEqual(f.snapshot(),before);
    await updateCard(f.db,'c1',{question:'سؤال في ملاحظة ثانية',answer:'جواب'});
    await updateCard(f.db,'c1',{question:'سؤال في ملاحظة ثانية',answer:'جواب آخر'});
    assert.equal(f.snapshot().cards.find(c=>c.id==='c1').answer,'جواب آخر');
    assert.deepEqual(f.snapshot().reviews,before.reviews);
  } finally {f.raw.close();}
});

test('a failed UPDATE rolls back text and preserves history instead of deleting and recreating the card', async () => {
  const f=fixture();
  try {
    const before=f.snapshot();
    f.raw.exec("CREATE TRIGGER reject_edit BEFORE UPDATE ON cards BEGIN SELECT RAISE(ABORT,'disk failure'); END;");
    await assert.rejects(updateCard(f.db,'c1',{question:'تعديل',answer:'جواب'}),/disk failure/);
    assert.deepEqual(f.snapshot(),before);
  } finally {f.raw.close();}
});
