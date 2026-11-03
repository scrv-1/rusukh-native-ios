import { Directory, File, Paths } from 'expo-file-system';
import type { CapturedMedia, MediaItem } from './types';
import { newMediaId } from './types';

const idPattern = /^[a-z0-9-]{1,90}$/;
const filePattern = /^[a-z0-9-]{1,90}\.(jpg|png|heic|heif|webp|m4a)$/;
const RECORDING_PREFIX = 'rusukh-recording-';
const activeRecordings = new Set<string>();
export function trackActiveRecording(id: string) {
  activeRecordings.add(id);
  return () => { activeRecordings.delete(id); };
}
const directory = () => new Directory(Paths.document, 'rusukh-media');
const trashDirectory = () => new Directory(directory(), 'trash');
const extensions: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/heic': 'heic', 'image/heif': 'heif', 'image/webp': 'webp', 'audio/mp4': 'm4a' };
const removed = (id: string) => new File(trashDirectory(), `${id}.json`).exists || new File(trashDirectory(), `${id}.removed`).exists;
let operation: Promise<unknown> = Promise.resolve();
function serialized<T>(work: () => Promise<T>): Promise<T> {
  const next = operation.then(work, work);
  operation = next.then(() => undefined, () => undefined);
  return next;
}

export function isMediaItem(value: unknown): value is MediaItem {
  if (!value || typeof value !== 'object') return false;
  const item = value as MediaItem;
  return item.version === 1 && typeof item.id === 'string' && idPattern.test(item.id)
    && (item.kind === 'image' || item.kind === 'audio')
    && typeof item.mimeType === 'string'
    && typeof item.fileName === 'string' && filePattern.test(item.fileName)
    && item.fileName === `${item.id}.${extensions[item.mimeType]}`
    && (item.kind === 'audio' ? item.mimeType === 'audio/mp4' : item.mimeType.startsWith('image/'))
    && typeof item.title === 'string' && item.title.length > 0 && item.title.length <= 160
    && Number.isFinite(item.createdAt) && item.createdAt > 0
    && Number.isSafeInteger(item.sizeBytes) && item.sizeBytes > 0
    && (item.durationMs === undefined || (Number.isFinite(item.durationMs) && item.durationMs >= 0));
}

export function mediaUri(item: MediaItem) {
  if (!isMediaItem(item)) throw new Error('بيانات الملف غير صالحة.');
  const file = new File(directory(), item.fileName);
  if (!file.exists || file.size <= 0) throw new Error('الملف غير موجود على الجهاز.');
  return file.uri;
}

export function saveCapturedMedia(input: CapturedMedia): Promise<MediaItem> {
  return serialized(() => saveMedia(input));
}
async function saveMedia(input: CapturedMedia): Promise<MediaItem> {
  if (!/^(file|content):\/\//.test(input.uri)) throw new Error('يجب اختيار ملف محلي من الجهاز.');
  const id = input.id ?? newMediaId();
  if (!idPattern.test(id)) throw new Error('اسم الملف غير صالح.');
  const mimeType = input.mimeType ?? (input.kind === 'audio' ? 'audio/mp4' : 'image/jpeg');
  const extension = extensions[mimeType];
  if (!extension || (input.kind === 'audio' ? mimeType !== 'audio/mp4' : !mimeType.startsWith('image/'))) throw new Error('صيغة الملف غير مدعومة.');
  const root = directory();
  root.create({ intermediates: true, idempotent: true });
  const manifest = new File(root, `${id}.json`);
  if (manifest.exists) {
    const existing: unknown = JSON.parse(await manifest.text());
    if (!isMediaItem(existing)) throw new Error('تعذّر قراءة بيانات الملف المحفوظ؛ لم تُحذف بياناته.');
    mediaUri(existing);
    return existing;
  }
  const target = new File(root, `${id}.${extension}`);
  // A completed local copy may outlive the picker cache after metadata failed.
  const original = new File(input.uri);
  const source = original.exists ? original : target;
  if (!source.exists || source.size <= 0) throw new Error('لا يوجد ملف مكتمل لحفظه.');
  const maxBytes = input.kind === 'image' ? 50 * 1024 * 1024 : 100 * 1024 * 1024;
  if (source.size > maxBytes) throw new Error(input.kind === 'image' ? 'الصورة تتجاوز الحد: ٥٠ ميغابايت.' : 'التسجيل يتجاوز الحد: ١٠٠ ميغابايت.');
  if (source.uri !== target.uri && !target.exists) {
    // Only a size-verified copy gets the recoverable payload filename.
    const staging = new File(root, `${id}.capture-pending`);
    await source.copy(staging, { overwrite: true });
    if (!staging.exists || staging.size !== source.size || staging.size <= 0) throw new Error('لم تكتمل كتابة الملف؛ أعد المحاولة.');
    await staging.move(target, { overwrite: false });
  }
  if (!target.exists || target.size !== source.size || target.size <= 0) throw new Error('لم تكتمل كتابة الملف؛ أعد المحاولة.');
  const item: MediaItem = {
    version: 1, id, kind: input.kind, fileName: target.name, mimeType,
    title: input.title?.trim().slice(0, 160) || (input.kind === 'audio' ? 'تسجيل صوتي' : 'صورة دراسية'),
    createdAt: Date.now(), sizeBytes: target.size,
    ...(input.durationMs !== undefined ? { durationMs: Math.max(0, Math.round(input.durationMs)) } : {}),
  };
  if (!isMediaItem(item)) throw new Error('تعذّر إعداد بيانات الملف.');
  const temporary = new File(root, `${id}.pending`);
  await temporary.write(JSON.stringify(item));
  await temporary.move(manifest, { overwrite: true });
  if (!manifest.exists || !isMediaItem(JSON.parse(await manifest.text()))) throw new Error('لم يتم تأكيد حفظ بيانات الملف.');
  // Delete only our own retained recording after both payload and metadata are durable.
  if (input.kind === 'audio' && source.uri !== target.uri && source.name === `${RECORDING_PREFIX}${id}.m4a`) {
    try { source.delete(); } catch { /* A harmless duplicate can be recovered/recognized on next load. */ }
  }
  return item;
}

export function loadMediaLibrary(recoverRecordings = false): Promise<{ items: MediaItem[]; warnings: string[] }> {
  return serialized(() => readLibrary(recoverRecordings));
}
async function readLibrary(recoverRecordings: boolean): Promise<{ items: MediaItem[]; warnings: string[] }> {
  const root = directory();
  root.create({ intermediates: true, idempotent: true });
  const warnings: string[] = [];
  if (recoverRecordings) {
    // These are the documented SDK 58 document-directory locations, limited to our prefix.
    for (const name of ['ExpoAudio', 'Audio']) {
      const recordings = new Directory(Paths.document, name);
      if (!recordings.exists) continue;
      for (const candidate of recordings.list()) {
        if (!(candidate instanceof File) || !candidate.name.startsWith(RECORDING_PREFIX) || !candidate.name.endsWith('.m4a')) continue;
        const id = candidate.name.slice(RECORDING_PREFIX.length, -4);
        if (!idPattern.test(id) || activeRecordings.has(id) || removed(id) || candidate.size <= 0) continue;
        try { await saveMedia({ id, kind: 'audio', uri: candidate.uri, title: 'تسجيل مستعاد', mimeType: 'audio/mp4' }); }
        catch { warnings.push('تعذّرت استعادة تسجيل سابق. احتُفظ بالملف الأصلي على الجهاز.'); }
      }
    }
  }
  for (const payload of root.list()) {
    if (payload instanceof File && payload.name.endsWith('.capture-pending')) { warnings.push('توجد نسخة غير مكتملة من وسيط سابق؛ احتُفظ بها دون إضافتها إلى المكتبة.'); continue; }
    if (!(payload instanceof File) || !filePattern.test(payload.name)) continue;
    const id = payload.name.slice(0, payload.name.lastIndexOf('.'));
    if (new File(root, `${id}.json`).exists || removed(id) || activeRecordings.has(id)) continue;
    if (!recoverRecordings) { warnings.push('يوجد وسيط غير مفهرس. حدّث مكتبة الوسائط لاستعادته قبل النسخ.'); continue; }
    try {
      const pending = new File(root, `${id}.pending`);
      if (pending.exists) {
        const item: unknown = JSON.parse(await pending.text());
        if (!isMediaItem(item) || item.id !== id || item.fileName !== payload.name || item.sizeBytes !== payload.size) throw new Error('Invalid pending metadata');
        await pending.move(new File(root, `${id}.json`), { overwrite: false });
      } else {
        const mimeType = Object.keys(extensions).find(mime => payload.name.endsWith(`.${extensions[mime]}`));
        if (!mimeType) throw new Error('Unknown extension');
        await saveMedia({ id, kind: mimeType === 'audio/mp4' ? 'audio' : 'image', uri: payload.uri, mimeType,
          title: mimeType === 'audio/mp4' ? 'تسجيل مستعاد' : 'صورة مستعادة' });
      }
      warnings.push('أُضيف وسيط مستعاد من ملفات التطبيق. افتحه للتحقق من اكتماله؛ قد لا تتوفر بياناته الأصلية.');
    } catch { warnings.push('يوجد وسيط غير مفهرس تعذّرت استعادته. احتُفظ بملفه دون تغيير.'); }
  }
  const items: MediaItem[] = [];
  for (const file of root.list()) {
    if (!(file instanceof File) || !file.name.endsWith('.json')) continue;
    try {
      const item: unknown = JSON.parse(await file.text());
      if (!isMediaItem(item) || file.name !== `${item.id}.json`) throw new Error('Invalid manifest');
      mediaUri(item);
      items.push(item);
    } catch { warnings.push('يوجد ملف لم يمكن قراءته. لم تُحذف بياناته.'); }
  }
  return { items: items.sort((a, b) => b.createdAt - a.createdAt), warnings: [...new Set(warnings)] };
}

async function matchingMetadata(file: File, item: MediaItem) {
  const stored: unknown = JSON.parse(await file.text());
  if (!isMediaItem(stored) || stored.id !== item.id || stored.fileName !== item.fileName
    || stored.sizeBytes !== item.sizeBytes || stored.createdAt !== item.createdAt || stored.mimeType !== item.mimeType) {
    throw new Error('تغيّرت بيانات الوسيط. حدّث المكتبة قبل المحاولة.');
  }
}
function checkedPayload(root: Directory, item: MediaItem) {
  if (!isMediaItem(item)) throw new Error('بيانات الوسيط غير صالحة.');
  const file = new File(root, item.fileName);
  if (!file.exists || file.size !== item.sizeBytes) throw new Error('ملف الوسيط مفقود أو غير مكتمل. لم تُحذف بياناته.');
  return file;
}
async function writeMetadata(file: File, item: MediaItem) {
  await file.write(JSON.stringify(item));
  await matchingMetadata(file, item);
}

/** Removal is reversible. Trash is never scanned as an orphan or purged on startup. */
export function trashMediaItem(item: MediaItem): Promise<void> {
  return serialized(async () => {
    const root = directory(), trash = trashDirectory();
    const payload = checkedPayload(root, item), metadata = new File(root, `${item.id}.json`);
    await matchingMetadata(metadata, item);
    trash.create({ intermediates: true, idempotent: true });
    const target = new File(trash, item.fileName), record = new File(trash, `${item.id}.json`);
    if (target.exists) throw new Error('توجد نسخة في المحذوفات. لم تُستبدل أي نسخة.');
    // Durable recovery metadata comes first; the source index stays until the payload moved.
    await writeMetadata(record, item);
    try {
      await payload.move(target, { overwrite: false });
      checkedPayload(trash, item);
      metadata.delete();
    } catch {
      const original = new File(root, item.fileName);
      if (!original.exists && target.exists) {
        try { await target.move(original, { overwrite: false }); } catch { /* Kept in trash with valid metadata for explicit restore. */ }
      }
      throw new Error('لم يكتمل النقل. احتُفظ بالملف في المكتبة أو المحذوفات؛ حدّث القائمة ثم حاول مجددًا.');
    }
  });
}

export function loadMediaTrash(): Promise<{ items: MediaItem[]; warnings: string[] }> {
  return serialized(async () => {
    const trash = trashDirectory(), items: MediaItem[] = [], warnings: string[] = [];
    if (!trash.exists) return { items, warnings };
    for (const file of trash.list()) {
      if (!(file instanceof File) || !file.name.endsWith('.json')) continue;
      try {
        const item: unknown = JSON.parse(await file.text());
        if (!isMediaItem(item) || file.name !== `${item.id}.json`) throw new Error('Invalid trash metadata');
        const payload = new File(trash, item.fileName);
        if (!payload.exists) continue; // Metadata left after a committed delete or successful rollback.
        checkedPayload(trash, item);
        if (new File(directory(), item.fileName).exists) { warnings.push('توجد نسختان لوسيط واحد. احتُفظ بهما دون استبدال.'); continue; }
        items.push(item);
      } catch { warnings.push('تعذّرت قراءة عنصر من المحذوفات؛ لم يُحذف أي ملف.'); }
    }
    return { items: items.sort((a, b) => b.createdAt - a.createdAt), warnings: [...new Set(warnings)] };
  });
}

export function restoreMediaItem(item: MediaItem): Promise<{ warning?: string }> {
  return serialized(async () => {
    const root = directory(), trash = trashDirectory();
    const payload = checkedPayload(trash, item), record = new File(trash, `${item.id}.json`);
    await matchingMetadata(record, item);
    const target = new File(root, item.fileName), metadata = new File(root, `${item.id}.json`);
    if (target.exists) throw new Error('يوجد ملف بالاسم نفسه في المكتبة؛ لم يُستبدل.');
    if (metadata.exists) await matchingMetadata(metadata, item);
    else await writeMetadata(metadata, item);
    await payload.move(target, { overwrite: false });
    checkedPayload(root, item);
    try {
      record.delete();
      const marker = new File(trash, `${item.id}.removed`);
      if (marker.exists) marker.delete();
    } catch { return { warning: 'استُعيد الملف؛ تعذّر تنظيف سجل قديم في المحذوفات.' }; }
    return {};
  });
}

/** Explicit permanent deletion only. Payload deletion is the irreversible commit point. */
export function permanentlyDeleteMediaItem(item: MediaItem): Promise<{ warning?: string }> {
  return serialized(async () => {
    const trash = trashDirectory(), root = directory();
    const payload = checkedPayload(trash, item), record = new File(trash, `${item.id}.json`);
    await matchingMetadata(record, item);
    if (new File(root, item.fileName).exists) throw new Error('توجد نسخة في المكتبة. لم يُحذف الملف؛ حدّث القوائم.');
    // This minimal ID marker prevents an old retained recording from being resurrected.
    const marker = new File(trash, `${item.id}.removed`);
    await marker.write('1');
    if (await marker.text() !== '1') throw new Error('تعذّر تأكيد سجل الحذف. لم يُحذف الملف.');
    if (item.kind === 'audio') {
      for (const name of ['ExpoAudio', 'Audio']) {
        const duplicate = new File(Paths.document, name, `${RECORDING_PREFIX}${item.id}.m4a`);
        if (duplicate.exists) duplicate.delete();
      }
    }
    // Keep metadata until the requested payload is gone; a rejected unlink retains its restore path.
    payload.delete();
    if (payload.exists) throw new Error('لم يكتمل حذف الملف؛ ما زال في المحذوفات.');
    try {
      record.delete();
      const stale = new File(root, `${item.id}.json`);
      if (stale.exists) { await matchingMetadata(stale, item); stale.delete(); }
    } catch { return { warning: 'حُذف الملف؛ تعذّر تنظيف بياناته الوصفية القديمة.' }; }
    return {};
  });
}
