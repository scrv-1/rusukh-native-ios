// Exercise the application's recovery SQL against real Node SQLite, not a phone.
const test = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const { mkdtempSync, rmSync } = require('node:fs');
const { join } = require('node:path');
const { tmpdir } = require('node:os');
const Module = require('node:module');
const originalLoad = Module._load;
Module._load = function(name, ...rest) { return name === 'expo-sqlite' ? {} : originalLoad.call(this, name, ...rest); };
const storage = require('../.test-build/storage.js');
Module._load = originalLoad;

function adapter(raw) { return {
  runAsync: async (sql, ...args) => raw.prepare(sql).run(...args),
  getFirstAsync: async (sql, ...args) => { const row = raw.prepare(sql).get(...args); return row ? { ...row } : null; },
  getAllAsync: async (sql, ...args) => raw.prepare(sql).all(...args).map(row => ({ ...row })),
  withExclusiveTransactionAsync: async fn => {
    raw.exec('BEGIN IMMEDIATE');
    try { await fn(adapter(raw)); raw.exec('COMMIT'); }
    catch (error) { raw.exec('ROLLBACK'); throw error; }
  },
}; }
function schema(raw) { raw.exec(`PRAGMA foreign_keys=ON;
CREATE TABLE notes(id TEXT PRIMARY KEY,title TEXT,body TEXT,createdAt INTEGER,updatedAt INTEGER);
CREATE TABLE cards(id TEXT PRIMARY KEY,noteId TEXT REFERENCES notes(id) ON DELETE CASCADE,question TEXT,answer TEXT,dueAt INTEGER,intervalDays INTEGER,ease REAL,repetitions INTEGER,updatedAt INTEGER);
CREATE TABLE reviews(id TEXT PRIMARY KEY,cardId TEXT REFERENCES cards(id) ON DELETE CASCADE,grade TEXT,reviewedAt INTEGER);
CREATE TABLE meta(key TEXT PRIMARY KEY,value TEXT);`); }
function sample(prefix) {
  return storage.makeBackup(
    [{ id: `${prefix}-n`, title: `درس ${prefix}`, body: 'محتوى عربي محفوظ', createdAt: 1, updatedAt: 2 }],
    [{ id: `${prefix}-c`, noteId: `${prefix}-n`, question: 'ما السؤال؟', answer: prefix, dueAt: 3, intervalDays: 1, ease: 2.5, repetitions: 1, updatedAt: 2 }],
    [{ id: `${prefix}-r`, cardId: `${prefix}-c`, grade: 'good', reviewedAt: 2 }],
  );
}
async function seed(db, data) {
  for (const n of data.notes) await storage.saveNote(db, n);
  for (const c of data.cards) await storage.saveCard(db, c);
  for (const r of data.reviews) await db.runAsync('INSERT INTO reviews VALUES(?,?,?,?)', r.id, r.cardId, r.grade, r.reviewedAt);
}
const studyData = backup => ({ notes: backup.notes, cards: backup.cards, reviews: backup.reviews });

test('recovery point captures the previous library and survives a WAL database reopen', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'rusukh-recovery-'));
  const path = join(dir, 'library.db');
  let raw = new DatabaseSync(path);
  try {
    schema(raw); raw.exec('PRAGMA journal_mode=WAL');
    let db = adapter(raw);
    const before = sample('before'), incoming = sample('incoming');
    await seed(db, before);
    await storage.setSetting(db, 'workspace-v1', '{"keep":"layout"}');
    await storage.setSetting(db, 'review-reminder', '{"systemId":"do-not-replay"}');
    await storage.restoreBackup(db, incoming);
    assert.deepEqual(await storage.readAll(db), studyData(incoming));
    const points = await storage.listRecoveryPoints(db);
    assert.equal(points.length, 1);
    assert.equal(points[0].reason, 'before-import');
    assert.deepEqual([points[0].noteCount, points[0].cardCount, points[0].reviewCount], [1, 1, 1]);
    raw.close(); raw = new DatabaseSync(path); raw.exec('PRAGMA foreign_keys=ON'); db = adapter(raw);
    assert.deepEqual(studyData(await storage.readRecoveryPoint(db, points[0].id)), studyData(before));
    await storage.restoreRecoveryPoint(db, points[0].id);
    assert.deepEqual(await storage.readAll(db), studyData(before));
    const afterRecovery = await storage.listRecoveryPoints(db);
    assert.equal(afterRecovery[0].reason, 'before-recovery');
    assert.deepEqual(studyData(await storage.readRecoveryPoint(db, afterRecovery[0].id)), studyData(incoming));
    assert.equal(await storage.getSetting(db, 'workspace-v1'), '{"keep":"layout"}');
    assert.equal(await storage.getSetting(db, 'review-reminder'), '{"systemId":"do-not-replay"}');
    assert.deepEqual(raw.prepare('PRAGMA foreign_key_check').all(), []);
  } finally { raw.close(); rmSync(dir, { recursive: true }); }
});

test('import failure rolls back both replacement and newly created recovery point', async () => {
  const raw = new DatabaseSync(':memory:'); schema(raw); const db = adapter(raw);
  try {
    const before = sample('before'); await seed(db, before);
    await storage.listRecoveryPoints(db);
    raw.exec("CREATE TRIGGER fail_incoming BEFORE INSERT ON cards WHEN NEW.id='incoming-c' BEGIN SELECT RAISE(ABORT,'disk failure'); END;");
    await assert.rejects(storage.restoreBackup(db, sample('incoming')), /disk failure/);
    assert.deepEqual(await storage.readAll(db), studyData(before));
    assert.deepEqual(await storage.listRecoveryPoints(db), []);
  } finally { raw.close(); }
});

test('failure to persist recovery refuses import and preserves all existing data', async () => {
  const raw = new DatabaseSync(':memory:'); schema(raw); const db = adapter(raw);
  try {
    const before = sample('before'); await seed(db, before);
    await storage.listRecoveryPoints(db);
    raw.exec("CREATE TRIGGER fail_snapshot BEFORE INSERT ON study_recovery_v1 BEGIN SELECT RAISE(ABORT,'snapshot storage full'); END;");
    await assert.rejects(storage.restoreBackup(db, sample('incoming')), /snapshot storage full/);
    assert.deepEqual(await storage.readAll(db), studyData(before));
  } finally { raw.close(); }
});

test('only the newest three successful recovery points remain; target selected before rotation', async () => {
  const raw = new DatabaseSync(':memory:'); schema(raw); const db = adapter(raw);
  try {
    await seed(db, sample('zero'));
    for (const name of ['one', 'two', 'three', 'four']) await storage.restoreBackup(db, sample(name));
    const points = await storage.listRecoveryPoints(db);
    assert.equal(points.length, 3);
    const labels = [];
    for (const point of points) labels.push((await storage.readRecoveryPoint(db, point.id)).notes[0].id);
    assert.deepEqual(labels, ['three-n', 'two-n', 'one-n']);
    await storage.restoreRecoveryPoint(db, points[2].id);
    assert.equal((await storage.readAll(db)).notes[0].id, 'one-n');
    assert.equal((await storage.listRecoveryPoints(db)).length, 3);
    assert.equal((await storage.readRecoveryPoint(db, (await storage.listRecoveryPoints(db))[0].id)).notes[0].id, 'four-n');
  } finally { raw.close(); }
});

test('corrupt, incompatible and nonexistent recovery points never replace the current library', async () => {
  const raw = new DatabaseSync(':memory:'); schema(raw); const db = adapter(raw);
  try {
    await seed(db, sample('before')); await storage.restoreBackup(db, sample('current'));
    const point = (await storage.listRecoveryPoints(db))[0];
    const original = await storage.readAll(db);
    for (const bad of ['not JSON', JSON.stringify({ ...sample('before'), version: 99 })]) {
      raw.prepare('UPDATE study_recovery_v1 SET payload=?,bytes=? WHERE id=?').run(bad, Buffer.byteLength(bad), point.id);
      await assert.rejects(storage.restoreRecoveryPoint(db, point.id));
      assert.deepEqual(await storage.readAll(db), original);
      assert.equal((await storage.listRecoveryPoints(db)).length, 1);
    }
    await assert.rejects(storage.restoreRecoveryPoint(db, 987654));
    await assert.rejects(storage.restoreRecoveryPoint(db, '1 OR 1=1'));
    assert.deepEqual(await storage.readAll(db), original);
  } finally { raw.close(); }
});

test('a failed import after retention rotation keeps all three previous recovery points', async () => {
  const raw = new DatabaseSync(':memory:'); schema(raw); const db = adapter(raw);
  try {
    await seed(db, sample('zero'));
    for (const name of ['one', 'two', 'three']) await storage.restoreBackup(db, sample(name));
    const beforePoints = await storage.listRecoveryPoints(db);
    const beforeData = await storage.readAll(db);
    raw.exec("CREATE TRIGGER fail_late BEFORE INSERT ON reviews WHEN NEW.id='failed-r' BEGIN SELECT RAISE(ABORT,'late failure'); END;");
    await assert.rejects(storage.restoreBackup(db, sample('failed')), /late failure/);
    assert.deepEqual(await storage.listRecoveryPoints(db), beforePoints);
    assert.deepEqual(await storage.readAll(db), beforeData);
    for (const point of beforePoints) assert.equal((await storage.readRecoveryPoint(db, point.id)).notes.length, 1);
  } finally { raw.close(); }
});

test('input mutation while import awaits the transaction cannot bypass validated content', async () => {
  const raw = new DatabaseSync(':memory:'); schema(raw); const db = adapter(raw);
  try {
    await seed(db, sample('before'));
    const incoming = sample('incoming');
    const restoring = storage.restoreBackup(db, incoming);
    incoming.notes[0].title = '';
    incoming.cards[0].noteId = 'nonexistent';
    await restoring;
    const after = await storage.readAll(db);
    assert.equal(after.notes[0].title, 'درس incoming');
    assert.equal(after.cards[0].noteId, 'incoming-n');
    assert.deepEqual(raw.prepare('PRAGMA foreign_key_check').all(), []);
  } finally { raw.close(); }
});

test('invalid input creates no snapshot and cannot overwrite the existing library', async () => {
  const raw = new DatabaseSync(':memory:'); schema(raw); const db = adapter(raw);
  try {
    const before = sample('before'); await seed(db, before);
    await assert.rejects(storage.restoreBackup(db, { ...sample('bad'), version: 77 }));
    assert.deepEqual(await storage.readAll(db), studyData(before));
    assert.deepEqual(await storage.listRecoveryPoints(db), []);
  } finally { raw.close(); }
});

test('an oversized safety snapshot blocks replacement instead of importing without protection', async () => {
  const raw = new DatabaseSync(':memory:'); schema(raw); const db = adapter(raw);
  try {
    for (let i = 0; i < 17; i++) await storage.saveNote(db, {
      id: `large-${i}`, title: `كبير ${i}`, body: 'x'.repeat(1_000_000), createdAt: i, updatedAt: i,
    });
    await assert.rejects(storage.restoreBackup(db, sample('incoming')), /نقطة رجوع/);
    assert.equal((await storage.readAll(db)).notes.length, 17);
    assert.deepEqual(await storage.listRecoveryPoints(db), []);
  } finally { raw.close(); }
});
