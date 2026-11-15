const mockFiles = new Map();
const mockDirectories = new Set();
let mockFailWrite = false;
let mockFailCopy = false;
let mockPartialCopy = false;
const mockFailDelete = new Set();
const mockFailMove = new Set();
jest.mock('expo-file-system', () => {
  const Paths = { document: 'file:///documents' };
  const uriOf = parts => parts.map(x => typeof x === 'string' ? x : x.uri).join('/');
  class File {
    constructor(...parts) { this.uri = uriOf(parts); }
    get name() { return this.uri.split('/').pop(); }
    get exists() { return mockFiles.has(this.uri); }
    get size() { return mockFiles.get(this.uri)?.length ?? 0; }
    async text() { if (!this.exists) throw new Error('missing'); return mockFiles.get(this.uri); }
    async write(text) { if (mockFailWrite) throw new Error('disk full'); mockFiles.set(this.uri, text); }
    async copy(target) { if (mockFailCopy) throw new Error('copy failed'); if (mockPartialCopy) { mockFiles.set(target.uri, 'partial'); throw new Error('copy interrupted'); } mockFiles.set(target.uri, await this.text()); }
    async move(target) { if (mockFailMove.has(this.uri)) throw new Error('move failed'); const old = this.uri; mockFiles.set(target.uri, await this.text()); mockFiles.delete(old); this.uri = target.uri; }
    delete() { if (mockFailDelete.has(this.uri)) throw new Error('delete failed'); mockFiles.delete(this.uri); }
  }
  class Directory {
    constructor(...parts) { this.uri = uriOf(parts); }
    get exists() { return mockDirectories.has(this.uri) || [...mockFiles.keys()].some(k => k.startsWith(this.uri + '/')); }
    create() { mockDirectories.add(this.uri); }
    list() { return [...mockFiles.keys()].filter(k => k.startsWith(this.uri + '/') && !k.slice(this.uri.length + 1).includes('/')).map(k => new File(k)); }
  }
  return { File, Directory, Paths };
});
import { Paths } from 'expo-file-system';
import { saveCapturedMedia, loadMediaLibrary, mediaUri, isMediaItem, trackActiveRecording, trashMediaItem, loadMediaTrash, restoreMediaItem, permanentlyDeleteMediaItem } from '../src/media/library';

beforeEach(() => { mockFiles.clear(); mockDirectories.clear(); mockFailWrite = false; mockFailCopy = false; mockPartialCopy = false; mockFailDelete.clear(); mockFailMove.clear(); Paths.document = 'file:///documents'; });
const photo = { id: 'photo-1', kind: 'image', uri: 'file:///cache/photo.jpg', mimeType: 'image/jpeg', title: 'ملاحظات المحاضرة' };
const seedPhoto = () => { mockFiles.set(photo.uri, 'real image bytes'); };

test('photo is copied out of cache and metadata survives reload with only relative paths', async () => {
  seedPhoto();
  const item = await saveCapturedMedia(photo);
  mockFiles.delete(photo.uri);
  const library = await loadMediaLibrary();
  expect(library.items).toEqual([item]);
  const raw = mockFiles.get('file:///documents/rusukh-media/photo-1.json');
  expect(raw).not.toContain('file://');
  expect(mediaUri(item)).toBe('file:///documents/rusukh-media/photo-1.jpg');
});

test('moving the iOS app container preserves usable relative metadata', async () => {
  seedPhoto(); const item = await saveCapturedMedia(photo);
  for (const [key, value] of [...mockFiles]) if (key.startsWith('file:///documents/')) { mockFiles.set(key.replace('file:///documents/', 'file:///new-container/'), value); mockFiles.delete(key); }
  Paths.document = 'file:///new-container';
  expect((await loadMediaLibrary()).items).toEqual([item]);
  expect(mediaUri(item)).toBe('file:///new-container/rusukh-media/photo-1.jpg');
});

test('failed copy does not publish a saved metadata record', async () => {
  seedPhoto(); mockFailCopy = true;
  await expect(saveCapturedMedia(photo)).rejects.toThrow();
  expect((await loadMediaLibrary()).items).toEqual([]);
  expect(mockFiles.has(photo.uri)).toBe(true);
});

test('metadata write failure retains source and payload for retry without false success', async () => {
  seedPhoto(); mockFailWrite = true;
  await expect(saveCapturedMedia(photo)).rejects.toThrow();
  expect(mockFiles.has(photo.uri)).toBe(true);
  expect(mockFiles.has('file:///documents/rusukh-media/photo-1.jpg')).toBe(true);
  expect((await loadMediaLibrary()).items).toEqual([]);
  mockFailWrite = false;
  await saveCapturedMedia(photo);
  expect((await loadMediaLibrary()).items).toHaveLength(1);
});

test('recovers only our retained audio and removes its original only after durable save', async () => {
  const uri = 'file:///documents/ExpoAudio/rusukh-recording-audio-1.m4a';
  mockFiles.set(uri, 'recording bytes');
  mockFiles.set('file:///documents/ExpoAudio/someone-elses-recording.m4a', 'other');
  const library = await loadMediaLibrary(true);
  expect(library.items).toHaveLength(1);
  expect(library.items[0].title).toBe('تسجيل مستعاد');
  expect(mockFiles.has(uri)).toBe(false);
  expect(mockFiles.has('file:///documents/ExpoAudio/someone-elses-recording.m4a')).toBe(true);
});

test('corrupt or missing payload metadata is reported without deleting user files', async () => {
  seedPhoto(); const item = await saveCapturedMedia(photo);
  mockFiles.delete(mediaUri(item));
  mockFiles.set('file:///documents/rusukh-media/bad.json', '{broken');
  const library = await loadMediaLibrary();
  expect(library.items).toEqual([]);
  expect(library.warnings.length).toBe(1);
  expect(mockFiles.has('file:///documents/rusukh-media/photo-1.json')).toBe(true);
  expect(mockFiles.has('file:///documents/rusukh-media/bad.json')).toBe(true);
});

test('remote URLs and path traversal are rejected before any file is copied', async () => {
  seedPhoto();
  await expect(saveCapturedMedia({ ...photo, uri: 'https://example.com/photo.jpg' })).rejects.toThrow();
  await expect(saveCapturedMedia({ ...photo, id: '../escape' })).rejects.toThrow();
  expect((await loadMediaLibrary()).items).toEqual([]);
});

test('empty recordings cannot become successful media entries', async () => {
  mockFiles.set('file:///empty.m4a', '');
  await expect(saveCapturedMedia({ kind: 'audio', uri: 'file:///empty.m4a' })).rejects.toThrow();
  expect((await loadMediaLibrary()).items).toEqual([]);
});

test('idempotent retry returns one existing attachment and rejects poisoned metadata filenames', async () => {
  seedPhoto(); const item = await saveCapturedMedia(photo);
  expect(await saveCapturedMedia(photo)).toEqual(item);
  expect((await loadMediaLibrary()).items).toHaveLength(1);
  expect(isMediaItem({ ...item, fileName: '../secret.jpg' })).toBe(false);
});


test('recovery skips recordings that a mounted or unmounting session is still finalizing', async () => {
  const uri = 'file:///documents/ExpoAudio/rusukh-recording-busy-1.m4a';
  mockFiles.set(uri, 'in-flight recording bytes');
  const untrack = trackActiveRecording('busy-1');
  expect((await loadMediaLibrary(true)).items).toEqual([]);
  expect(mockFiles.has(uri)).toBe(true);
  untrack();
  expect((await loadMediaLibrary(true)).items).toHaveLength(1);
});

test('D004 recovers an orphan photo after metadata failure and loss of its source cache', async () => {
  seedPhoto(); mockFailWrite = true;
  await expect(saveCapturedMedia(photo)).rejects.toThrow();
  mockFailWrite = false; mockFiles.delete(photo.uri);
  const recovered = await loadMediaLibrary(true);
  expect(recovered.items).toHaveLength(1);
  expect(recovered.items[0]).toMatchObject({ id: 'photo-1', kind: 'image', fileName: 'photo-1.jpg' });
  expect(mediaUri(recovered.items[0])).toBe('file:///documents/rusukh-media/photo-1.jpg');
  expect(recovered.warnings.join(' ')).toContain('مستعاد');
  expect(await saveCapturedMedia(photo)).toEqual(recovered.items[0]);
});

test('D007 removal is recoverable and explicit restore preserves metadata and bytes', async () => {
  seedPhoto(); const item = await saveCapturedMedia(photo);
  await trashMediaItem(item);
  expect((await loadMediaLibrary(true)).items).toEqual([]);
  expect((await loadMediaTrash()).items).toEqual([item]);
  expect(mockFiles.get('file:///documents/rusukh-media/trash/photo-1.jpg')).toBe('real image bytes');
  await restoreMediaItem(item);
  expect((await loadMediaLibrary(true)).items).toEqual([item]);
  expect((await loadMediaTrash()).items).toEqual([]);
  expect(mockFiles.get(mediaUri(item))).toBe('real image bytes');
});

test('cache loss can be retried directly from an owned payload without recopying', async () => {
  seedPhoto(); mockFailWrite = true;
  await expect(saveCapturedMedia(photo)).rejects.toThrow();
  mockFailWrite = false; mockFiles.delete(photo.uri); mockFailCopy = true;
  const item = await saveCapturedMedia(photo);
  expect(item.title).toBe(photo.title);
  expect((await loadMediaLibrary()).items).toEqual([item]);
});

test('recovery preserves valid pending metadata and refuses incomplete or malformed records', async () => {
  seedPhoto(); const item = await saveCapturedMedia(photo);
  const root = 'file:///documents/rusukh-media/';
  mockFiles.set(root + 'photo-1.pending', mockFiles.get(root + 'photo-1.json'));
  mockFiles.delete(root + 'photo-1.json');
  expect((await loadMediaLibrary(true)).items).toEqual([item]);
  mockFiles.delete(root + 'photo-1.json');
  mockFiles.set(root + 'photo-1.pending', JSON.stringify({ ...item, sizeBytes: 999 }));
  expect((await loadMediaLibrary(true)).items).toEqual([]);
  expect(mockFiles.get(root + 'photo-1.jpg')).toBe('real image bytes');
  mockFiles.set(root + 'photo-1.pending', '{broken');
  expect((await loadMediaLibrary(true)).warnings.join(' ')).toContain('تعذّرت');
  mockFiles.set(root + 'not-our-file.exe', 'foreign');
  mockFiles.set(root + 'Empty.jpg', '');
  expect((await loadMediaLibrary(true)).items).toEqual([]);
  expect(mockFiles.get(root + 'not-our-file.exe')).toBe('foreign');
});

test.each(['metadata', 'move', 'index'])('failed trash %s step leaves the active file and metadata recoverable', async step => {
  seedPhoto(); const item = await saveCapturedMedia(photo);
  const original = mediaUri(item);
  if (step === 'metadata') mockFailWrite = true;
  if (step === 'move') mockFailMove.add(original);
  if (step === 'index') mockFailDelete.add('file:///documents/rusukh-media/photo-1.json');
  await expect(trashMediaItem(item)).rejects.toThrow();
  expect(mockFiles.get(original)).toBe('real image bytes');
  expect((await loadMediaLibrary()).items).toEqual([item]);
  expect((await loadMediaTrash()).items).toEqual([]);
});

test('failed rollback keeps the payload in trash and an explicit restore repairs the split state', async () => {
  seedPhoto(); const item = await saveCapturedMedia(photo);
  mockFailDelete.add('file:///documents/rusukh-media/photo-1.json');
  mockFailMove.add('file:///documents/rusukh-media/trash/photo-1.jpg');
  await expect(trashMediaItem(item)).rejects.toThrow('احتُفظ');
  expect((await loadMediaTrash()).items).toEqual([item]);
  expect((await loadMediaLibrary(true)).items).toEqual([]);
  mockFailDelete.clear(); mockFailMove.clear();
  await restoreMediaItem(item);
  expect((await loadMediaLibrary(true)).items).toEqual([item]);
});

test.each(['metadata', 'move', 'collision'])('failed restore %s preserves the trash copy without overwriting another file', async step => {
  seedPhoto(); const item = await saveCapturedMedia(photo); await trashMediaItem(item);
  if (step === 'metadata') mockFailWrite = true;
  if (step === 'move') mockFailMove.add('file:///documents/rusukh-media/trash/photo-1.jpg');
  if (step === 'collision') mockFiles.set('file:///documents/rusukh-media/photo-1.jpg', 'different existing file');
  await expect(restoreMediaItem(item)).rejects.toThrow();
  expect(mockFiles.get('file:///documents/rusukh-media/trash/photo-1.jpg')).toBe('real image bytes');
  if (step === 'collision') expect(mockFiles.get('file:///documents/rusukh-media/photo-1.jpg')).toBe('different existing file');
});

test.each(['marker', 'payload'])('failed permanent %s deletion leaves a restorable payload and its metadata', async step => {
  seedPhoto(); const item = await saveCapturedMedia(photo); await trashMediaItem(item);
  if (step === 'marker') mockFailWrite = true;
  else mockFailDelete.add('file:///documents/rusukh-media/trash/photo-1.jpg');
  await expect(permanentlyDeleteMediaItem(item)).rejects.toThrow();
  expect((await loadMediaTrash()).items).toEqual([item]);
  expect(mockFiles.get('file:///documents/rusukh-media/trash/photo-1.jpg')).toBe('real image bytes');
});

test('permanent payload deletion reports metadata-cleanup failure honestly and prevents recovery', async () => {
  seedPhoto(); const item = await saveCapturedMedia(photo); await trashMediaItem(item);
  mockFailDelete.add('file:///documents/rusukh-media/trash/photo-1.json');
  const result = await permanentlyDeleteMediaItem(item);
  expect(result.warning).toContain('حُذف الملف');
  expect(mockFiles.has('file:///documents/rusukh-media/trash/photo-1.jpg')).toBe(false);
  expect(mockFiles.get('file:///documents/rusukh-media/trash/photo-1.removed')).toBe('1');
  expect((await loadMediaTrash()).items).toEqual([]);
  expect((await loadMediaLibrary(true)).items).toEqual([]);
});

test('removed recordings are not resurrected and permanent deletion touches only their owned duplicates', async () => {
  const source = 'file:///documents/ExpoAudio/rusukh-recording-audio-1.m4a';
  mockFiles.set(source, 'recording bytes');
  const item = await saveCapturedMedia({ id: 'audio-1', kind: 'audio', uri: source });
  mockFiles.set(source, 'retained duplicate');
  mockFiles.set('file:///documents/Audio/rusukh-recording-other.m4a', 'other recording');
  await trashMediaItem(item);
  expect((await loadMediaLibrary(true)).items.map(media => media.id)).not.toContain('audio-1');
  expect(mockFiles.has(source)).toBe(true);
  await permanentlyDeleteMediaItem(item);
  expect(mockFiles.has(source)).toBe(false);
  expect((await loadMediaLibrary(true)).items.map(media => media.id)).not.toContain('audio-1');
  expect((await loadMediaLibrary()).items.map(media => media.id)).toContain('other');
});

test('trash and restore requests serialize, and invalid metadata cannot select arbitrary paths', async () => {
  seedPhoto(); const item = await saveCapturedMedia(photo);
  await Promise.all([trashMediaItem(item), restoreMediaItem(item)]);
  expect((await loadMediaLibrary()).items).toEqual([item]);
  await expect(trashMediaItem({ ...item, fileName: '../photo-1.jpg' })).rejects.toThrow();
  expect(mockFiles.get(mediaUri(item))).toBe('real image bytes');
});

test('an interrupted copy is staged separately and cannot become a recovered complete item', async () => {
  seedPhoto(); mockPartialCopy = true;
  await expect(saveCapturedMedia(photo)).rejects.toThrow();
  mockFiles.delete(photo.uri); mockPartialCopy = false;
  expect((await loadMediaLibrary(true)).items).toEqual([]);
  expect(mockFiles.has('file:///documents/rusukh-media/photo-1.jpg')).toBe(false);
});
