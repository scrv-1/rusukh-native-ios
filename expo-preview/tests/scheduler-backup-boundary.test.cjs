const test = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const { mkdtempSync, rmSync } = require('node:fs');
const { join } = require('node:path');
const { tmpdir } = require('node:os');
const Module = require('node:module');
const originalLoad = Module._load;
Module._load = function (name, ...rest) { return name === 'expo-sqlite' ? {} : originalLoad.call(this, name, ...rest); };
const storage = require('../.test-build/storage.js');
Module._load = originalLoad;
const {
  MAX_INTERVAL_DAYS, MAX_REPETITIONS, scheduleReview, serializeBackup, validateBackup,
} = require('../.test-build/core.js');

function backup(card) {
  return {
    format: 'rusukh-backup', version: 1, exportedAt: '2026-11-15T00:00:00.000Z',
    notes: [{ id: 'n1', title: 'درس', body: 'مصدر', createdAt: 1, updatedAt: 1 }],
    cards: [card], reviews: [],
  };
}

for (const grade of ['again', 'hard', 'good', 'easy']) {
  test(`accepted ceiling stays exportable after ${grade}`, () => {
    const now = Date.UTC(2026, 10, 15);
    for (const intervalDays of [0, MAX_INTERVAL_DAYS - 1, MAX_INTERVAL_DAYS]) {
      for (const repetitions of [0, MAX_REPETITIONS - 1, MAX_REPETITIONS]) {
        const card = {
          id: 'c1', noteId: 'n1', question: 'سؤال', answer: 'جواب',
          dueAt: now, updatedAt: now, intervalDays, repetitions, ease: 5,
        };
        const before = structuredClone(card);
        assert.equal(validateBackup(backup(card)), true);
        const reviewed = scheduleReview(card, grade, now);
        assert.deepEqual(card, before);
        assert.ok(reviewed.intervalDays <= MAX_INTERVAL_DAYS);
        assert.ok(reviewed.repetitions <= MAX_REPETITIONS);
        assert.equal(validateBackup(backup(reviewed)), true);
        const parsed = JSON.parse(serializeBackup(backup(reviewed)));
        assert.deepEqual(parsed.cards[0], reviewed);
        assert.equal(validateBackup(parsed), true);
        assert.ok(reviewed.dueAt > now);
      }
    }
  });
}

test('good and easy at the ceiling do not exceed one thousand ninety-five thousand days', () => {
  const now = Date.UTC(2026, 10, 15);
  const card = {
    id: 'c1', noteId: 'n1', question: 'سؤال', answer: 'جواب',
    dueAt: now, updatedAt: now, intervalDays: MAX_INTERVAL_DAYS, repetitions: MAX_REPETITIONS, ease: 3,
  };
  for (const grade of ['hard', 'good', 'easy']) {
    const reviewed = scheduleReview(card, grade, now);
    assert.equal(reviewed.intervalDays, MAX_INTERVAL_DAYS);
    assert.equal(reviewed.repetitions, MAX_REPETITIONS);
    assert.equal(reviewed.dueAt, now + MAX_INTERVAL_DAYS * 24 * 60 * 60 * 1000);
  }
});

function adapter(raw) {
  return {
    runAsync: async (sql, ...args) => raw.prepare(sql).run(...args),
    getFirstAsync: async (sql, ...args) => { const row = raw.prepare(sql).get(...args); return row ? { ...row } : null; },
    getAllAsync: async (sql, ...args) => raw.prepare(sql).all(...args).map(row => ({ ...row })),
    withExclusiveTransactionAsync: async fn => {
      raw.exec('BEGIN IMMEDIATE');
      try { await fn(adapter(raw)); raw.exec('COMMIT'); }
      catch (error) { raw.exec('ROLLBACK'); throw error; }
    },
  };
}
function schema(raw) {
  raw.exec(`PRAGMA foreign_keys=ON;
CREATE TABLE notes(id TEXT PRIMARY KEY,title TEXT,body TEXT,createdAt INTEGER,updatedAt INTEGER);
CREATE TABLE cards(id TEXT PRIMARY KEY,noteId TEXT REFERENCES notes(id) ON DELETE CASCADE,question TEXT,answer TEXT,dueAt INTEGER,intervalDays INTEGER,ease REAL,repetitions INTEGER,updatedAt INTEGER);
CREATE TABLE reviews(id TEXT PRIMARY KEY,cardId TEXT REFERENCES cards(id) ON DELETE CASCADE,grade TEXT,reviewedAt INTEGER);
CREATE TABLE meta(key TEXT PRIMARY KEY,value TEXT);`);
}

test('ceiling review round-trips through SQLite export and import', async () => {
  const now = Date.UTC(2026, 10, 15);
  const card = {
    id: 'c1', noteId: 'n1', question: 'سؤال الحد', answer: 'جواب الحد',
    dueAt: now, updatedAt: now, intervalDays: MAX_INTERVAL_DAYS, repetitions: MAX_REPETITIONS, ease: 3,
  };
  const dir = mkdtempSync(join(tmpdir(), 'rusukh-ceiling-'));
  const sourcePath = join(dir, 'source.db');
  const destPath = join(dir, 'dest.db');
  const sourceRaw = new DatabaseSync(sourcePath);
  const destRaw = new DatabaseSync(destPath);
  try {
    schema(sourceRaw);
    schema(destRaw);
    const source = adapter(sourceRaw);
    const note = { id: 'n1', title: 'درس الحد', body: 'يبقى قابلاً للتصدير', createdAt: 1, updatedAt: 1 };
    await storage.saveNote(source, note);
    await storage.saveCard(source, card);
    await storage.recordReview(source, card, 'good');
    const stored = (await storage.readAll(source)).cards[0];
    assert.equal(stored.intervalDays, MAX_INTERVAL_DAYS);
    assert.equal(stored.repetitions, MAX_REPETITIONS);
    const current = await storage.readAll(source);
    const exported = storage.makeBackup(current.notes, current.cards, current.reviews);
    assert.equal(validateBackup(exported), true);
    const text = serializeBackup(exported);
    const parsed = JSON.parse(text);
    assert.equal(validateBackup(parsed), true);
    assert.equal(parsed.cards[0].intervalDays, MAX_INTERVAL_DAYS);
    assert.equal(parsed.cards[0].repetitions, MAX_REPETITIONS);
    await storage.restoreBackup(adapter(destRaw), parsed);
    const restored = (await storage.readAll(adapter(destRaw))).cards[0];
    assert.equal(restored.intervalDays, stored.intervalDays);
    assert.equal(restored.repetitions, stored.repetitions);
    assert.equal(restored.question, stored.question);
    assert.equal(restored.answer, stored.answer);
    const recovery = await storage.listRecoveryPoints(adapter(destRaw));
    assert.equal(recovery.length, 1);
    assert.equal(recovery[0].reason, 'before-import');
  } finally {
    sourceRaw.close();
    destRaw.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
