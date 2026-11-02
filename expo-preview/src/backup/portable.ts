import { Directory, File, Paths } from 'expo-file-system';
import { MAX_BACKUP_BYTES, serializeBackup, utf8ByteLength, validateBackup } from '../core';
import type { Backup } from '../types';
import { isMediaItem, loadMediaLibrary, mediaUri } from '../media/library';
import type { MediaItem } from '../media/types';
import { MODULES, readWorkspace, type Workspace } from '../workspace';

export const MAX_PORTABLE_BYTES = 512 * 1024 * 1024;
export const MAX_PORTABLE_MEDIA = 1000;
const MAX_MANIFEST_BYTES = 1024 * 1024;
const MAX_PREFERENCES_BYTES = 16 * 1024;
const MANIFEST = 'manifest.json';
const shaPattern = /^[a-f0-9]{64}$/;
export type PortablePreferences = { isDark: boolean; workspace: Workspace };
export type PortableSnapshot = { study: Backup; preferences: PortablePreferences };
type CheckedFile = { bytes: number; sha256: string };
type MediaEntry = { item: MediaItem; sha256: string };
type Manifest = {
  format: 'rusukh-portable-folder'; version: 1; createdAt: string;
  study: CheckedFile; preferences: CheckedFile; media: MediaEntry[];
};
export type PortablePreview = PortableSnapshot & {
  directory: Directory; manifestSHA256: string; manifest: Manifest; totalBytes: number;
};
export type PortableOperation = { onProgress?: (message: string) => void; isCancelled?: () => boolean };
const uniqueId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
function checkpoint(operation?: PortableOperation) {
  if (operation?.isCancelled?.()) throw new Error('أوقفت العملية. لم تُحذف ملفاتك السابقة.');
}
function preferences(value: unknown): PortablePreferences {
  if (!value || typeof value !== 'object') throw new Error('إعدادات النسخة غير صالحة.');
  const p = value as PortablePreferences;
  const w = p.workspace;
  if (typeof p.isDark !== 'boolean' || !w || w.version !== 1
    || !['comfortable', 'compact'].includes(w.density) || !Array.isArray(w.modules)
    || w.modules.length > MODULES.length || new Set(w.modules.map(m => m?.id)).size !== w.modules.length
    || w.modules.some(m => !m || typeof m.enabled !== 'boolean' || !MODULES.some(known => known.id === m.id))) {
    throw new Error('إعدادات النسخة غير صالحة.');
  }
  // Only explicitly supported presentation preferences cross the boundary.
  return { isDark: p.isDark, workspace: readWorkspace(JSON.stringify(w)) };
}
async function digest(file: File): Promise<string> {
  const sha = (await file.digest('SHA-256')).toLowerCase();
  if (!shaPattern.test(sha)) throw new Error('تعذّر فحص سلامة الملف.');
  return sha;
}
function requireSize(file: File, limit: number, expected?: number) {
  if (!file.exists || !Number.isSafeInteger(file.size) || file.size <= 0 || file.size > limit
    || (expected !== undefined && file.size !== expected)) throw new Error('أحد ملفات النسخة مفقود أو تجاوز الحجم المسموح.');
}
async function verifyFile(file: File, entry: CheckedFile, limit: number) {
  requireSize(file, limit, entry.bytes);
  if (await digest(file) !== entry.sha256) throw new Error('تغيّر أحد ملفات النسخة أو تلف؛ لم تُستعد بيانات الدراسة.');
}
// The picker grants access to mutable external folders. Verify and consume an owned
// cache copy, rather than hashing an external file and reading different bytes later.
async function ownedText(source: File, limit: number, expected?: CheckedFile) {
  requireSize(source, limit, expected?.bytes);
  const temporary = new File(Paths.cache, `rusukh-backup-check-${uniqueId()}.json`);
  const originalURI = temporary.uri;
  try {
    await source.copy(temporary, { overwrite: false });
    requireSize(temporary, limit, expected?.bytes);
    const sha256 = await digest(temporary);
    if (expected && sha256 !== expected.sha256) throw new Error('تغيّر أحد ملفات النسخة أو تلف؛ لم تُستعد بيانات الدراسة.');
    const text = await temporary.text();
    if (utf8ByteLength(text) > limit || (expected && utf8ByteLength(text) !== expected.bytes)) throw new Error('حجم النص في النسخة غير صالح.');
    return { text, sha256 };
  } finally { removeTemporary(originalURI); }
}
function removeTemporary(uri: string) {
  // Use the captured URI: Expo File.move changes the File object's URI.
  try { const file = new File(uri); if (file.exists) file.delete(); } catch { /* A cleanup failure never deletes or replaces published files. */ }
}
async function publishMetadata(root: Directory, item: MediaItem, destination: File) {
  const temporary = new File(root, `${item.id}-${uniqueId()}.pending`);
  const originalURI = temporary.uri;
  try { await temporary.write(JSON.stringify(item)); await temporary.move(destination, { overwrite: false }); }
  finally { removeTemporary(originalURI); }
}
async function matchesMediaMetadata(file: File, item: MediaItem, sizeBytes: number): Promise<boolean> {
  try {
    requireSize(file, MAX_PREFERENCES_BYTES);
    const existing: unknown = JSON.parse(await file.text());
    return isMediaItem(existing) && existing.id === item.id
      && existing.fileName === item.fileName && existing.sizeBytes === sizeBytes;
  } catch {
    // Preserve unreadable metadata and treat it as a collision, never as a reusable file.
    return false;
  }
}
function checkedFile(value: CheckedFile, limit: number) {
  return value && Number.isSafeInteger(value.bytes) && value.bytes > 0 && value.bytes <= limit
    && typeof value.sha256 === 'string' && shaPattern.test(value.sha256);
}
function parseManifest(value: unknown): Manifest {
  if (!value || typeof value !== 'object') throw new Error('هذا المجلد ليس نسخة رُسوخ مكتملة.');
  const m = value as Manifest;
  if (m.format !== 'rusukh-portable-folder' || m.version !== 1 || typeof m.createdAt !== 'string'
    || !Number.isFinite(Date.parse(m.createdAt)) || !checkedFile(m.study, MAX_BACKUP_BYTES)
    || !checkedFile(m.preferences, MAX_PREFERENCES_BYTES) || !Array.isArray(m.media)
    || m.media.length > MAX_PORTABLE_MEDIA) throw new Error('تنسيق النسخة غير صالح أو يتجاوز الحدود.');
  const ids = new Set<string>();
  let total = m.study.bytes + m.preferences.bytes;
  for (const entry of m.media) {
    if (!entry || !isMediaItem(entry.item) || !shaPattern.test(entry.sha256) || ids.has(entry.item.id)
      || entry.item.sizeBytes > (entry.item.kind === 'audio' ? 100 : 50) * 1024 * 1024) {
      throw new Error('بيانات الوسائط غير صالحة أو مكررة.');
    }
    ids.add(entry.item.id); total += entry.item.sizeBytes;
  }
  if (total > MAX_PORTABLE_BYTES) throw new Error('تتجاوز النسخة الحد الإجمالي: 512 ميغابايت.');
  return m;
}

/** Creates a new child folder only. manifest.json is the final commit marker. */
export async function exportPortableFolder(parent: Directory, snapshot: PortableSnapshot, operation?: PortableOperation) {
  const studyText = serializeBackup(snapshot.study);
  const safePreferences = preferences(snapshot.preferences);
  const prefText = JSON.stringify(safePreferences);
  const library = await loadMediaLibrary(false);
  if (library.warnings.length) throw new Error('توجد وسائط لم يمكن قراءتها. راجع مصادري قبل إنشاء نسخة كاملة.');
  if (library.items.length > MAX_PORTABLE_MEDIA) throw new Error('الحد الأقصى للنسخة 1000 ملف وسائط.');
  const total = utf8ByteLength(studyText) + utf8ByteLength(prefText) + library.items.reduce((sum, i) => sum + i.sizeBytes, 0);
  if (total > MAX_PORTABLE_BYTES) throw new Error('تتجاوز النسخة الحد الإجمالي: 512 ميغابايت.');
  // Validate source payloads before creating a folder in the user's selection.
  for (const item of library.items) requireSize(new File(mediaUri(item)), item.kind === 'audio' ? 100 * 1024 * 1024 : 50 * 1024 * 1024, item.sizeBytes);
  checkpoint(operation);
  const folder = new Directory(parent, `rusukh-backup-${uniqueId()}`);
  folder.create();
  const payloads = new Directory(folder, 'media'); payloads.create();
  const studyFile = new File(folder, 'study.json'); await studyFile.write(studyText);
  const prefFile = new File(folder, 'preferences.json'); await prefFile.write(prefText);
  if (await studyFile.text() !== studyText || await prefFile.text() !== prefText) throw new Error('لم تتطابق الملفات المكتوبة مع الأصل؛ النسخة غير مكتملة.');
  const manifest: Manifest = {
    format: 'rusukh-portable-folder', version: 1, createdAt: new Date().toISOString(),
    study: { bytes: utf8ByteLength(studyText), sha256: await digest(studyFile) },
    preferences: { bytes: utf8ByteLength(prefText), sha256: await digest(prefFile) }, media: [],
  };
  requireSize(studyFile, MAX_BACKUP_BYTES, manifest.study.bytes);
  requireSize(prefFile, MAX_PREFERENCES_BYTES, manifest.preferences.bytes);
  for (const [index, item] of library.items.entries()) {
    checkpoint(operation); operation?.onProgress?.(`نسخ الملف ${index + 1} من ${library.items.length}…`);
    const source = new File(mediaUri(item)); const sha256 = await digest(source);
    const target = new File(payloads, item.fileName);
    await source.copy(target, { overwrite: false });
    await verifyFile(target, { bytes: item.sizeBytes, sha256 }, item.sizeBytes);
    manifest.media.push({ item, sha256 });
  }
  checkpoint(operation);
  parseManifest(manifest);
  const manifestText = JSON.stringify(manifest);
  const manifestFile = new File(folder, MANIFEST); await manifestFile.write(manifestText);
  // Read back the marker; an incomplete write must never be announced as complete.
  requireSize(manifestFile, MAX_MANIFEST_BYTES);
  const savedManifest = await manifestFile.text();
  if (savedManifest !== manifestText) throw new Error('لم يكتمل حفظ فهرس النسخة.');
  parseManifest(JSON.parse(savedManifest));
  return { directory: folder, mediaCount: manifest.media.length, totalBytes: total };
}

/** Read-only preview; paths are fixed or derived from validated media filenames. */
export async function inspectPortableFolder(directory: Directory, operation?: PortableOperation): Promise<PortablePreview> {
  checkpoint(operation);
  const marker = new File(directory, MANIFEST); requireSize(marker, MAX_MANIFEST_BYTES);
  const markerCopy = await ownedText(marker, MAX_MANIFEST_BYTES);
  const manifestSHA256 = markerCopy.sha256;
  const manifest = parseManifest(JSON.parse(markerCopy.text));
  const studyFile = new File(directory, 'study.json');
  const studyCopy = await ownedText(studyFile, MAX_BACKUP_BYTES, manifest.study);
  const study: unknown = JSON.parse(studyCopy.text);
  if (!validateBackup(study)) throw new Error('محتوى الدراسة في النسخة غير صالح.');
  const prefFile = new File(directory, 'preferences.json');
  const prefCopy = await ownedText(prefFile, MAX_PREFERENCES_BYTES, manifest.preferences);
  const safePreferences = preferences(JSON.parse(prefCopy.text));
  for (const [index, entry] of manifest.media.entries()) {
    checkpoint(operation); operation?.onProgress?.(`فحص الملف ${index + 1} من ${manifest.media.length}…`);
    await verifyFile(new File(directory, 'media', entry.item.fileName), { bytes: entry.item.sizeBytes, sha256: entry.sha256 }, entry.item.sizeBytes);
  }
  checkpoint(operation);
  if (await digest(marker) !== manifestSHA256) throw new Error('تغيّرت النسخة أثناء الفحص. اخترها مرة أخرى.');
  checkpoint(operation);
  return { directory, manifestSHA256, manifest, study, preferences: safePreferences,
    totalBytes: manifest.study.bytes + manifest.preferences.bytes + manifest.media.reduce((sum, e) => sum + e.item.sizeBytes, 0) };
}

/** Additive merge only. Text restore is intentionally a separate, recoverable SQL step. */
export async function mergePortableMedia(preview: PortablePreview, operation?: PortableOperation) {
  const checked = await inspectPortableFolder(preview.directory, operation);
  if (checked.manifestSHA256 !== preview.manifestSHA256) throw new Error('تغيّرت النسخة بعد المعاينة. اخترها مرة أخرى.');
  const root = new Directory(Paths.document, 'rusukh-media'); root.create({ intermediates: true, idempotent: true });
  let added = 0, reused = 0;
  for (const entry of checked.manifest.media) {
    checkpoint(operation);
    let item = entry.item;
    let target = new File(root, item.fileName);
    let metadata = new File(root, `${item.id}.json`);
    if (target.exists || metadata.exists) {
      if (target.exists && !metadata.exists && await digest(target) === entry.sha256 && target.size === item.sizeBytes) {
        // Resume a copy interrupted between payload and metadata publication.
        await publishMetadata(root, item, metadata);
        added++; continue;
      }
      if (target.exists && metadata.exists && await digest(target) === entry.sha256) {
        if (await matchesMediaMetadata(metadata, item, target.size)) { reused++; continue; }
      }
      // Stable collision IDs make retries idempotent without overwriting old files.
      const id = `import-${item.id.slice(0, 35)}-${entry.sha256.slice(0, 24)}`;
      item = { ...item, id, fileName: `${id}.${item.fileName.split('.').pop()}` };
      target = new File(root, item.fileName); metadata = new File(root, `${id}.json`);
      if (target.exists || metadata.exists) {
        if (target.exists && !metadata.exists && await digest(target) === entry.sha256 && target.size === item.sizeBytes) {
          await publishMetadata(root, item, metadata);
          added++; continue;
        }
        if (target.exists && metadata.exists && await digest(target) === entry.sha256) {
          if (await matchesMediaMetadata(metadata, item, target.size)) { reused++; continue; }
        }
        throw new Error('تعارض ملف موجود مع وسيط مستورد. لم يُستبدل الملف السابق؛ قد تكون أضيفت وسائط قبل التوقف.');
      }
    }
    operation?.onProgress?.(`استعادة الوسائط ${added + reused + 1} من ${checked.manifest.media.length}…`);
    const pendingPayload = new File(root, `${item.id}-${uniqueId()}.pending`);
    const originalURI = pendingPayload.uri;
    try {
      await new File(checked.directory, 'media', entry.item.fileName).copy(pendingPayload, { overwrite: false });
      await verifyFile(pendingPayload, { bytes: item.sizeBytes, sha256: entry.sha256 }, item.sizeBytes);
      checkpoint(operation);
      await pendingPayload.move(target, { overwrite: false });
      await publishMetadata(root, item, metadata);
      added++;
    } finally { removeTemporary(originalURI); }
  }
  checkpoint(operation);
  return { added, reused, study: checked.study, preferences: checked.preferences };
}
