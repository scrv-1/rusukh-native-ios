import * as SQLite from 'expo-sqlite';
import { File } from 'expo-file-system';

// Rescue export has the same 512 MiB transfer ceiling as portable folders.
// This does not raise the JSON limit or make the rescue file importable in-app.
export const MAX_DATABASE_SNAPSHOT_BYTES = 512 * 1024 * 1024;
export type DatabaseSnapshot = {
  uri: string; name: string; bytes: number;
  notes: number; cards: number; reviews: number; recoveryPoints: number; hasDraft: boolean;
};

async function databaseBytes(db: SQLite.SQLiteDatabase): Promise<number> {
  const pages = await db.getFirstAsync<{ page_count: number }>('PRAGMA page_count');
  const pageSize = await db.getFirstAsync<{ page_size: number }>('PRAGMA page_size');
  const count = pages?.page_count;
  const size = pageSize?.page_size;
  if (!Number.isSafeInteger(count) || !Number.isSafeInteger(size) || !count || !size || count < 0 || size < 0) {
    throw new Error('تعذّر تحديد حجم قاعدة البيانات بأمان.');
  }
  const bytes = count * size;
  if (!Number.isSafeInteger(bytes) || bytes > MAX_DATABASE_SNAPSHOT_BYTES) {
    throw new Error('ملف قاعدة البيانات يتجاوز حد نسخة الإنقاذ: 512 ميغابايت. لم تتغير بياناتك.');
  }
  return bytes;
}

/**
 * Read-only rescue of the live SQLite database to a newly reserved local file.
 * Includes study rows, drafts, preferences and recovery points; excludes media.
 * Native backup copies on disk; no whole-database Uint8Array or JSON is created.
 * The caller shares the returned file and must explain that in-app restore is
 * unsupported. Only the newly opened destination connection is ever closed.
 */
export async function createDatabaseSnapshot(source: SQLite.SQLiteDatabase, directoryUri: string): Promise<DatabaseSnapshot> {
  if (typeof directoryUri !== 'string' || !directoryUri.startsWith('file://')) {
    throw new Error('أنشئ نسخة الإنقاذ في مجلد محلي للتطبيق ثم شاركها إلى الملفات.');
  }
  await databaseBytes(source);
  const name = `rusukh-rescue-${Date.now()}-${Math.random().toString(36).slice(2, 11)}.sqlite`;
  const file = new File(directoryUri, name);
  // Exclusive creation reserves this attempt's path. Never open or clean up a
  // pre-existing file, even if two attempts happened to choose the same name.
  file.create({ overwrite: false });
  let destination: SQLite.SQLiteDatabase | null = null;
  let complete = false;
  try {
    destination = await SQLite.openDatabaseAsync(name, { useNewConnection: true }, directoryUri);
    await SQLite.backupDatabaseAsync({ sourceDatabase: source, destDatabase: destination });
    const bytes = await databaseBytes(destination);
    // Share one self-contained file; WAL/SHM sidecars must not be required.
    const journal = await destination.getFirstAsync<{ journal_mode: string }>('PRAGMA journal_mode=DELETE');
    if (journal?.journal_mode !== 'delete') throw new Error('تعذّر إكمال ملف SQLite مستقل للمشاركة.');
    const integrity = await destination.getFirstAsync<{ integrity_check: string }>('PRAGMA integrity_check(1)');
    if (integrity?.integrity_check !== 'ok') throw new Error('لم ينجح فحص سلامة نسخة الإنقاذ.');
    if (await destination.getFirstAsync('PRAGMA foreign_key_check')) {
      throw new Error('فشل فحص علاقات البيانات في نسخة الإنقاذ. لم تتغير القاعدة الأصلية.');
    }
    const summary = await destination.getFirstAsync<{
      notes: number; cards: number; reviews: number; recoveryPoints: number; hasDraft: number;
    }>(`SELECT
      (SELECT COUNT(*) FROM notes) AS notes,
      (SELECT COUNT(*) FROM cards) AS cards,
      (SELECT COUNT(*) FROM reviews) AS reviews,
      (SELECT COUNT(*) FROM study_recovery_v1) AS recoveryPoints,
      EXISTS(SELECT 1 FROM meta WHERE key='noteDraft.v1' AND value<>'null') AS hasDraft`);
    if (!summary || ![summary.notes, summary.cards, summary.reviews, summary.recoveryPoints].every(value => Number.isSafeInteger(value) && value >= 0)) {
      throw new Error('تعذّر التحقق من محتويات نسخة الإنقاذ.');
    }
    await destination.closeAsync();
    destination = null;
    if (!file.exists || file.size !== bytes || file.size > MAX_DATABASE_SNAPSHOT_BYTES) {
      throw new Error('لم يكتمل ملف نسخة الإنقاذ. لم تتغير القاعدة الأصلية.');
    }
    complete = true;
    return { uri: file.uri, name, bytes, notes: summary.notes, cards: summary.cards,
      reviews: summary.reviews, recoveryPoints: summary.recoveryPoints, hasDraft: summary.hasDraft === 1 };
  } finally {
    if (destination) {
      try { await destination.closeAsync(); } catch { /* Never close the source connection while cleaning up a failed export. */ }
    }
    if (!complete) {
      try { await SQLite.deleteDatabaseAsync(name, directoryUri); } catch { /* A partial cache copy may remain; no successful file is announced. */ }
    }
  }
}
