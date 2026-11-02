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
const extensions: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/heic': 'heic', 'image/heif': 'heif', 'image/webp': 'webp', 'audio/mp4': 'm4a' };

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

export async function saveCapturedMedia(input: CapturedMedia): Promise<MediaItem> {
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
  const source = new File(input.uri);
  if (!source.exists || source.size <= 0) throw new Error('لا يوجد ملف مكتمل لحفظه.');
  const maxBytes = input.kind === 'image' ? 50 * 1024 * 1024 : 100 * 1024 * 1024;
  if (source.size > maxBytes) throw new Error(input.kind === 'image' ? 'الصورة تتجاوز الحد: ٥٠ ميغابايت.' : 'التسجيل يتجاوز الحد: ١٠٠ ميغابايت.');
  const target = new File(root, `${id}.${extension}`);
  if (source.uri !== target.uri) await source.copy(target, { overwrite: true });
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

export async function loadMediaLibrary(recoverRecordings = false): Promise<{ items: MediaItem[]; warnings: string[] }> {
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
        if (!idPattern.test(id) || activeRecordings.has(id) || candidate.size <= 0) continue;
        try { await saveCapturedMedia({ id, kind: 'audio', uri: candidate.uri, title: 'تسجيل مستعاد', mimeType: 'audio/mp4' }); }
        catch { warnings.push('تعذّرت استعادة تسجيل سابق. احتُفظ بالملف الأصلي على الجهاز.'); }
      }
    }
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
