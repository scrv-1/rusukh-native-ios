const mockFiles = new Map();
const mockDirectories = new Set();
let mockFailWrite = false;
let mockFailCopy = false;
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
    async copy(target) { if (mockFailCopy) throw new Error('copy failed'); mockFiles.set(target.uri, await this.text()); }
    async move(target) { const old = this.uri; mockFiles.set(target.uri, await this.text()); mockFiles.delete(old); this.uri = target.uri; }
    delete() { mockFiles.delete(this.uri); }
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
import { saveCapturedMedia, loadMediaLibrary, mediaUri, isMediaItem, trackActiveRecording } from '../src/media/library';

beforeEach(() => { mockFiles.clear(); mockDirectories.clear(); mockFailWrite = false; mockFailCopy = false; Paths.document = 'file:///documents'; });
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
