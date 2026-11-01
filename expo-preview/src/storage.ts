import * as SQLite from 'expo-sqlite';
import type { Backup, Note, ReviewEvent, StudyCard, Grade } from './types';
import { makeId, scheduleReview, validateBackup } from './core';

export type Database = SQLite.SQLiteDatabase;

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
  `);
  const seeded = await db.getFirstAsync<{ value: string }>('SELECT value FROM meta WHERE key = ?', 'seeded');
  if (!seeded) {
    const now = Date.now();
    const one: Note = { id: makeId('note', now), title: 'التعلّم النشط',
      body: 'التعلّم النشط يعني استرجاع المعرفة بدل الاكتفاء بإعادة القراءة.\n\nيرتبط بـ [[المراجعة المتباعدة]].\n\nس: ما الفرق بين التعلّم النشط وإعادة القراءة؟\nج: التعلّم النشط يتطلب استدعاء المعلومة من الذاكرة.',
      createdAt: now, updatedAt: now };
    const two: Note = { id: makeId('note', now + 1), title: 'المراجعة المتباعدة',
      body: 'المراجعة المتباعدة تعني توزيع جلسات المراجعة عبر فترات زمنية.\n\nانظر [[التعلّم النشط]].\n\nس: ما المقصود بالمراجعة المتباعدة؟\nج: مراجعة المعلومات في أوقات متباعدة لتعزيز الاحتفاظ بها.',
      createdAt: now, updatedAt: now };
    await db.withExclusiveTransactionAsync(async (tx) => {
      for (const note of [one, two]) {
        await tx.runAsync('INSERT INTO notes VALUES (?, ?, ?, ?, ?)', note.id, note.title, note.body, note.createdAt, note.updatedAt);
      }
      for (const [note, q, a] of [
        [one, 'ما فائدة الاسترجاع النشط؟', 'تقوية القدرة على تذكّر المعلومات.'],
        [two, 'ما فكرة المراجعة المتباعدة؟', 'توزيع المراجعات على فترات زمنية.'],
      ] as const) {
        const c: StudyCard = { id: makeId('card'), noteId: note.id, question: q, answer: a,
          dueAt: now, intervalDays: 0, ease: 2.5, repetitions: 0, updatedAt: now };
        await tx.runAsync('INSERT INTO cards VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
          c.id, c.noteId, c.question, c.answer, c.dueAt, c.intervalDays, c.ease, c.repetitions, c.updatedAt);
      }
      await tx.runAsync('INSERT INTO meta (key,value) VALUES (?,?)','seeded','1');
    });
  }
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

export async function restoreBackup(db: Database, data: unknown) {
  if (!validateBackup(data)) throw new Error('ملف النسخة الاحتياطية غير صالح');
  const backup: Backup = data;
  await db.withExclusiveTransactionAsync(async (tx) => {
    await tx.runAsync('DELETE FROM reviews');
    await tx.runAsync('DELETE FROM cards');
    await tx.runAsync('DELETE FROM notes');
    for (const n of backup.notes) await tx.runAsync('INSERT INTO notes VALUES (?,?,?,?,?)',n.id,n.title,n.body,n.createdAt,n.updatedAt);
    for (const c of backup.cards) await tx.runAsync('INSERT INTO cards VALUES (?,?,?,?,?,?,?,?,?)',
      c.id,c.noteId,c.question,c.answer,c.dueAt,c.intervalDays,c.ease,c.repetitions,c.updatedAt);
    for (const r of backup.reviews) await tx.runAsync('INSERT INTO reviews VALUES (?,?,?,?)',r.id,r.cardId,r.grade,r.reviewedAt);
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
