import * as SQLite from 'expo-sqlite';
import type { Backup, Note, ReviewEvent, StudyCard, Grade } from './types';
import { makeId, normalizeTitle, replaceWikiLinks, scheduleReview, serializeBackup, utf8ByteLength, MAX_BACKUP_BYTES, validateBackup } from './core';
import { MAX_NOTE_CHARS } from './sources';

export type Database = SQLite.SQLiteDatabase;

// These are local undo points, not a portable backup of attachments or settings.
// Bounded at three 15 MiB JSON payloads. SQLite/WAL pages may temporarily use
// additional disk space; failed writes abort the complete import transaction.
export const MAX_RECOVERY_POINTS = 3;
export type RecoveryPoint = {
  id: number; schemaVersion: 1; createdAt: number;
  reason: 'before-import' | 'before-recovery';
  noteCount: number; cardCount: number; reviewCount: number; bytes: number;
};
const recoverySchema = `CREATE TABLE IF NOT EXISTS study_recovery_v1 (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  schemaVersion INTEGER NOT NULL,
  createdAt INTEGER NOT NULL, reason TEXT NOT NULL,
  noteCount INTEGER NOT NULL, cardCount INTEGER NOT NULL, reviewCount INTEGER NOT NULL,
  bytes INTEGER NOT NULL CHECK(bytes > 0 AND bytes <= ${MAX_BACKUP_BYTES}),
  payload TEXT NOT NULL
)`;

async function ensureRecoveryTable(db: Database): Promise<void> {
  await db.runAsync(recoverySchema);
}

export async function openStorage(): Promise<Database> {
  const db = await SQLite.openDatabaseAsync('rusukh-v1.db');
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS notes (
      id TEXT PRIMARY KEY NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL,
      createdAt INTEGER NOT NULL, updatedAt INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS cards (
      id TEXT PRIMARY KEY NOT NULL, noteId TEXT NOT NULL, question TEXT NOT NULL,
      answer TEXT NOT NULL, dueAt INTEGER NOT NULL, intervalDays INTEGER NOT NULL,
      ease REAL NOT NULL, repetitions INTEGER NOT NULL, updatedAt INTEGER NOT NULL,
      FOREIGN KEY(noteId) REFERENCES notes(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS reviews (
      id TEXT PRIMARY KEY NOT NULL, cardId TEXT NOT NULL, grade TEXT NOT NULL,
      reviewedAt INTEGER NOT NULL,
      FOREIGN KEY(cardId) REFERENCES cards(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);
    ${recoverySchema};
  `);
  // Bootstrap creates structure only. Existing notes (including legacy examples)
  // and the legacy seeded preference remain untouched on every reopen.
  return db;
}

export async function readAll(db: Database): Promise<{ notes: Note[]; cards: StudyCard[]; reviews: ReviewEvent[] }> {
  const notes = await db.getAllAsync<Note>('SELECT * FROM notes ORDER BY updatedAt DESC');
  const cards = await db.getAllAsync<StudyCard>('SELECT * FROM cards ORDER BY updatedAt DESC');
  const reviews = await db.getAllAsync<ReviewEvent>('SELECT * FROM reviews ORDER BY reviewedAt DESC');
  return { notes, cards, reviews };
}

export async function saveNote(db: Database, note: Note): Promise<void> {
  await db.runAsync(`INSERT INTO notes (id,title,body,createdAt,updatedAt) VALUES (?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET title=excluded.title,body=excluded.body,updatedAt=excluded.updatedAt`,
    note.id, note.title, note.body, note.createdAt, note.updatedAt);
}

export async function deleteNote(db: Database, id: string): Promise<void> {
  await db.runAsync('DELETE FROM notes WHERE id = ?', id);
}

export async function saveNoteAndCards(db: Database, note: Note, cards: StudyCard[]): Promise<void> {
  await db.withExclusiveTransactionAsync(async tx => {
    const previous = await tx.getFirstAsync<{ title: string }>('SELECT title FROM notes WHERE id = ?', note.id);
    let savedNote = note;
    if (previous && previous.title !== note.title) {
      const oldTitle = normalizeTitle(previous.title);
      const retarget = (body: string) => {
        // Parse complete links; never interpolate a user title into a RegExp or
        // replacement string. Aliases and surrounding prose stay unchanged.
        const updated = replaceWikiLinks(body, (full, target, alias) => {
          if (normalizeTitle(target) !== oldTitle) return full;
          if (/[\]|\r\n]/.test(note.title)) throw new Error('العنوان الجديد يحتوي محارف لا تدعمها الروابط. اختر عنوانًا آخر.');
          return `[[${note.title}${alias ?? ''}]]`;
        });
        if (updated.length > MAX_NOTE_CHARS) throw new Error('النص طويل جدًا بعد تحديث الروابط. اختر عنوانًا أقصر.');
        return updated;
      };
      savedNote = { ...note, body: retarget(note.body) };
      const others = await tx.getAllAsync<Note>('SELECT * FROM notes WHERE id <> ?', note.id);
      for (const linked of others) {
        const body = retarget(linked.body);
        if (body !== linked.body) {
          await tx.runAsync('UPDATE notes SET body=?, updatedAt=? WHERE id=?', body, Math.max(linked.updatedAt, note.updatedAt), linked.id);
        }
      }
    }
    await saveNote(tx, savedNote);
    for (const card of cards) await saveCard(tx, card);
  });
}

export async function saveCard(db: Database, card: StudyCard): Promise<void> {
  await db.runAsync(`INSERT INTO cards (id,noteId,question,answer,dueAt,intervalDays,ease,repetitions,updatedAt)
    VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET
    question=excluded.question,answer=excluded.answer,dueAt=excluded.dueAt,
    intervalDays=excluded.intervalDays,ease=excluded.ease,
    repetitions=excluded.repetitions,updatedAt=excluded.updatedAt`,
    card.id, card.noteId, card.question, card.answer, card.dueAt, card.intervalDays, card.ease,
    card.repetitions, card.updatedAt);
}

export async function deleteCard(db: Database, id: string) {
  await db.runAsync('DELETE FROM cards WHERE id = ?', id);
}

export async function recordReview(db: Database, card: StudyCard, grade: Grade): Promise<void> {
  const now = Date.now();
  const updated = scheduleReview(card, grade, now);
  await db.withExclusiveTransactionAsync(async (tx) => {
    await tx.runAsync('UPDATE cards SET dueAt=?,intervalDays=?,ease=?,repetitions=?,updatedAt=? WHERE id=?',
      updated.dueAt, updated.intervalDays, updated.ease, updated.repetitions, updated.updatedAt, updated.id);
    await tx.runAsync('INSERT INTO reviews VALUES (?,?,?,?)',makeId('review'),card.id,grade,now);
  });
}

async function replaceStudyData(tx: Database, backup: Backup): Promise<void> {
  await tx.runAsync('DELETE FROM reviews');
  await tx.runAsync('DELETE FROM cards');
  await tx.runAsync('DELETE FROM notes');
  for (const n of backup.notes) await tx.runAsync('INSERT INTO notes VALUES (?,?,?,?,?)',n.id,n.title,n.body,n.createdAt,n.updatedAt);
  for (const c of backup.cards) await tx.runAsync('INSERT INTO cards VALUES (?,?,?,?,?,?,?,?,?)',
    c.id,c.noteId,c.question,c.answer,c.dueAt,c.intervalDays,c.ease,c.repetitions,c.updatedAt);
  for (const r of backup.reviews) await tx.runAsync('INSERT INTO reviews VALUES (?,?,?,?)',r.id,r.cardId,r.grade,r.reviewedAt);
}

async function snapshotStudyData(tx: Database, reason: RecoveryPoint['reason']): Promise<void> {
  await ensureRecoveryTable(tx);
  const current = await readAll(tx);
  let payload: string;
  try {
    payload = serializeBackup(makeBackup(current.notes, current.cards, current.reviews));
  } catch {
    throw new Error('تعذّر إنشاء نقطة رجوع آمنة للبيانات الحالية. لم تُستبدل الملاحظات. صدّر بياناتك وراجع حجمها وصحتها أولًا.');
  }
  await tx.runAsync(`INSERT INTO study_recovery_v1
    (schemaVersion,createdAt,reason,noteCount,cardCount,reviewCount,bytes,payload) VALUES (?,?,?,?,?,?,?,?)`,
    1, Date.now(), reason, current.notes.length, current.cards.length, current.reviews.length, utf8ByteLength(payload), payload);
  // Rotation belongs to the same transaction as the replacement. If any later
  // write fails, both the previous library and previous recovery points survive.
  await tx.runAsync(`DELETE FROM study_recovery_v1 WHERE id NOT IN
    (SELECT id FROM study_recovery_v1 ORDER BY id DESC LIMIT ?)`, MAX_RECOVERY_POINTS);
}

export async function restoreBackup(db: Database, data: unknown): Promise<void> {
  if (!validateBackup(data)) throw new Error('ملف النسخة الاحتياطية غير صالح');
  // Clone the validated input before awaiting so a caller cannot mutate it
  // between validation and insertion; apply the same portable 15 MiB limit.
  const backup: Backup = JSON.parse(serializeBackup(data));
  await db.withExclusiveTransactionAsync(async (tx) => {
    await snapshotStudyData(tx, 'before-import');
    await replaceStudyData(tx, backup);
  });
}

export async function listRecoveryPoints(db: Database): Promise<RecoveryPoint[]> {
  await ensureRecoveryTable(db);
  return db.getAllAsync<RecoveryPoint>(`SELECT id,schemaVersion,createdAt,reason,noteCount,cardCount,reviewCount,bytes
    FROM study_recovery_v1 ORDER BY id DESC LIMIT ?`, MAX_RECOVERY_POINTS);
}

export async function readRecoveryPoint(db: Database, id: number): Promise<Backup> {
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error('معرّف نقطة الرجوع غير صالح.');
  await ensureRecoveryTable(db);
  const row = await db.getFirstAsync<{ schemaVersion: number; payload: string; bytes: number }>(
    'SELECT schemaVersion,payload,bytes FROM study_recovery_v1 WHERE id=?', id);
  if (!row) throw new Error('نقطة الرجوع غير موجودة؛ قد تكون خرجت من آخر ثلاث نقاط محفوظة.');
  if (row.schemaVersion !== 1 || typeof row.payload !== 'string' ||
      row.bytes > MAX_BACKUP_BYTES || utf8ByteLength(row.payload) !== row.bytes) {
    throw new Error('نقطة الرجوع غير متوافقة أو تالفة. لم تُستبدل البيانات.');
  }
  let backup: unknown;
  try { backup = JSON.parse(row.payload); }
  catch { throw new Error('تعذّر قراءة نقطة الرجوع. لم تُستبدل البيانات.'); }
  if (!validateBackup(backup)) throw new Error('نقطة الرجوع غير صالحة. لم تُستبدل البيانات.');
  return backup;
}

export async function restoreRecoveryPoint(db: Database, id: number): Promise<void> {
  await db.withExclusiveTransactionAsync(async tx => {
    // Read and validate the selected point before rotation could remove it.
    const backup = await readRecoveryPoint(tx, id);
    await snapshotStudyData(tx, 'before-recovery');
    await replaceStudyData(tx, backup);
  });
}

export function makeBackup(notes: Note[], cards: StudyCard[], reviews: ReviewEvent[]): Backup {
  return { format:'rusukh-backup', version:1, exportedAt:new Date().toISOString(), notes, cards, reviews };
}

export async function getSetting(db: Database, key: string): Promise<string | null> {
  const row = await db.getFirstAsync<{ value: string }>('SELECT value FROM meta WHERE key = ?', key);
  return row?.value ?? null;
}
export async function setSetting(db: Database, key: string, value: string): Promise<void> {
  await db.runAsync('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', key, value);
}
