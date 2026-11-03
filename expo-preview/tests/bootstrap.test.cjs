// Exercise openStorage's real bootstrap SQL on disk-backed Node SQLite, not iOS.
const test = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const { mkdtempSync, rmSync } = require('node:fs');
const { join } = require('node:path');
const { tmpdir } = require('node:os');
const Module = require('node:module');

let fixture;
function adapter(raw) {
  return {
    execAsync: async sql => {
      fixture.executedSchemas++;
      if (fixture.failNextBootstrap) {
        fixture.failNextBootstrap = false;
        // Fail in SQLite after the PRAGMAs execute, rather than replacing the
        // entire bootstrap with a mock that never opens the existing file.
        raw.exec(sql.replace('CREATE TABLE IF NOT EXISTS notes', 'CREATE TABLE ! notes'));
      }
      raw.exec(sql);
    },
    runAsync: async (sql, ...args) => raw.prepare(sql).run(...args),
    getFirstAsync: async (sql, ...args) => raw.prepare(sql).get(...args) ?? null,
    getAllAsync: async (sql, ...args) => raw.prepare(sql).all(...args),
    withExclusiveTransactionAsync: async work => {
      raw.exec('BEGIN IMMEDIATE');
      try { await work(adapter(raw)); raw.exec('COMMIT'); }
      catch (error) { raw.exec('ROLLBACK'); throw error; }
    },
  };
}
const sqlite = {
  openDatabaseAsync: async name => {
    fixture.openedNames.push(name);
    const raw = new DatabaseSync(join(fixture.directory, name));
    fixture.connections.push(raw);
    return adapter(raw);
  },
};
const originalLoad = Module._load;
let openStorage, readAll;
try {
  Module._load = function (name, ...rest) {
    return name === 'expo-sqlite' ? sqlite : originalLoad.call(this, name, ...rest);
  };
  ({ openStorage, readAll } = require('../.test-build/storage.js'));
} finally { Module._load = originalLoad; }

function closeConnections() {
  for (const raw of fixture.connections.splice(0)) raw.close();
}
async function withDatabase(run) {
  fixture = { directory: mkdtempSync(join(tmpdir(), 'rusukh-bootstrap-')), connections: [], openedNames: [], executedSchemas: 0 };
  try { await run(); }
  finally { closeConnections(); rmSync(fixture.directory, { recursive: true }); }
}
const emptyStudy = { notes: [], cards: [], reviews: [] };
function snapshot(raw) {
  return Object.fromEntries(['notes', 'cards', 'reviews', 'meta', 'study_recovery_v1'].map(table => [
    table, raw.prepare(`SELECT * FROM ${table} ORDER BY ${table === 'meta' ? 'key' : 'id'}`).all(),
  ]));
}
function createExistingDatabase(seeded) {
  const raw = new DatabaseSync(join(fixture.directory, 'rusukh-v1.db'));
  try {
    raw.exec(`PRAGMA foreign_keys = ON;
      CREATE TABLE notes(id TEXT PRIMARY KEY, title TEXT, body TEXT, createdAt INTEGER, updatedAt INTEGER);
      CREATE TABLE cards(id TEXT PRIMARY KEY, noteId TEXT REFERENCES notes(id) ON DELETE CASCADE,
        question TEXT, answer TEXT, dueAt INTEGER, intervalDays INTEGER, ease REAL, repetitions INTEGER, updatedAt INTEGER);
      CREATE TABLE reviews(id TEXT PRIMARY KEY, cardId TEXT REFERENCES cards(id) ON DELETE CASCADE, grade TEXT, reviewedAt INTEGER);
      CREATE TABLE meta(key TEXT PRIMARY KEY, value TEXT);
      CREATE TABLE study_recovery_v1(id INTEGER PRIMARY KEY AUTOINCREMENT, schemaVersion INTEGER,
        createdAt INTEGER, reason TEXT, noteCount INTEGER, cardCount INTEGER, reviewCount INTEGER, bytes INTEGER, payload TEXT);`);
    // Include old example titles as well as user-authored material. Bootstrap
    // must never infer that an existing note is disposable sample content.
    const insertNote = raw.prepare('INSERT INTO notes VALUES (?,?,?,?,?)');
    insertNote.run('legacy-one', 'التعلّم النشط', 'نص قديم عدله المستخدم', 1, 4);
    insertNote.run('legacy-two', 'المراجعة المتباعدة', 'نص المثال القديم محفوظ', 2, 5);
    insertNote.run('personal', 'ملاحظتي الخاصة', 'محتوى لا يُمس', 3, 6);
    raw.prepare('INSERT INTO cards VALUES (?,?,?,?,?,?,?,?,?)').run('old-card', 'personal', 'سؤال محفوظ', 'جواب محفوظ', 20, 3, 2.5, 2, 10);
    raw.prepare('INSERT INTO reviews VALUES (?,?,?,?)').run('old-review', 'old-card', 'good', 10);
    const meta = raw.prepare('INSERT INTO meta VALUES (?,?)');
    if (seeded) meta.run('seeded', '1');
    meta.run('darkMode', 'true');
    meta.run('workspace.v1', '{"version":1,"density":"compact","modules":[]}');
    meta.run('noteDraft.v1', '{"version":1,"editingId":null,"title":"مسودتي","body":"نص غير منشور","updatedAt":1}');
    const payload = JSON.stringify({ format: 'rusukh-backup', version: 1, exportedAt: '2026-11-03T00:00:00Z', notes: [], cards: [], reviews: [] });
    raw.prepare('INSERT INTO study_recovery_v1 VALUES (?,?,?,?,?,?,?,?,?)').run(7, 1, 10, 'before-import', 0, 0, 0, Buffer.byteLength(payload), payload);
    return snapshot(raw);
  } finally { raw.close(); }
}

test('fresh bootstrap creates the schema and a completely empty study library', async () => {
  await withDatabase(async () => {
    const db = await openStorage();
    assert.deepEqual(await readAll(db), emptyStudy);
    assert.deepEqual(await db.getAllAsync('SELECT * FROM meta'), []);
    assert.deepEqual(fixture.openedNames, ['rusukh-v1.db']);
    assert.equal(fixture.executedSchemas, 1);
    assert.equal((await db.getFirstAsync('PRAGMA journal_mode')).journal_mode, 'wal');
    assert.equal((await db.getFirstAsync('PRAGMA foreign_keys')).foreign_keys, 1);
    for (const table of ['notes', 'cards', 'reviews', 'meta', 'study_recovery_v1']) {
      assert.ok(await db.getFirstAsync('SELECT name FROM sqlite_master WHERE type=? AND name=?', 'table', table));
    }
  });
});

test('repeated disk reopen of a new library never inserts sample content or a seeded flag', async () => {
  await withDatabase(async () => {
    for (let opening = 0; opening < 3; opening++) {
      const db = await openStorage();
      assert.deepEqual(await readAll(db), emptyStudy);
      assert.equal(await db.getFirstAsync('SELECT value FROM meta WHERE key=?', 'seeded'), null);
      closeConnections();
    }
    assert.equal(fixture.openedNames.length, 3);
    assert.equal(fixture.executedSchemas, 3);
  });
});

for (const seeded of [true, false]) {
  test(`existing library ${seeded ? 'with' : 'without'} a seeded flag survives every bootstrap unchanged`, async () => {
    await withDatabase(async () => {
      const before = createExistingDatabase(seeded);
      for (let opening = 0; opening < 3; opening++) {
        const db = await openStorage();
        assert.deepEqual(snapshot(fixture.connections.at(-1)), before);
        assert.deepEqual(await db.getAllAsync('PRAGMA foreign_key_check'), []);
        closeConnections();
      }
      assert.equal(fixture.openedNames.length, 3);
      assert.equal(fixture.executedSchemas, 3);
    });
  });
}

test('failed schema initialization leaves old content intact and the next open can retry safely', async () => {
  await withDatabase(async () => {
    const before = createExistingDatabase(false);
    fixture.failNextBootstrap = true;
    await assert.rejects(openStorage(), /syntax error|unrecognized token/);
    assert.deepEqual(snapshot(fixture.connections.at(-1)), before);
    closeConnections();
    const db = await openStorage();
    assert.deepEqual(snapshot(fixture.connections.at(-1)), before);
    assert.deepEqual(await db.getAllAsync('PRAGMA foreign_key_check'), []);
    assert.equal(fixture.openedNames.length, 2);
  });
});
