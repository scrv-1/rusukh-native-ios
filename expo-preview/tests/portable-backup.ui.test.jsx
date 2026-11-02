const mockFiles = new Map();
const mockDirectories = new Set();
let mockFailCopy = false;
let mockFailMetadataMove = false;
let mockOversizeManifest = false;
let mockManifestRead = false;
let mockMutateAfterDigest = false;
let mockCancelOnPendingCopy = false;
let mockCancelled = false;
jest.mock('expo-file-system', () => {
  const crypto = require('node:crypto');
  const join = parts => parts.map(p => typeof p === 'string' ? p : p.uri).join('/');
  class File {
    constructor(...parts) { this.uri = join(parts); }
    get name() { return this.uri.split('/').pop(); }
    get exists() { return mockFiles.has(this.uri); }
    get size() { return mockOversizeManifest && this.name === 'manifest.json' ? 2 * 1024 * 1024 : mockFiles.get(this.uri)?.length ?? 0; }
    async text() { if (this.name === 'manifest.json') mockManifestRead = true; if (!this.exists) throw new Error('missing'); return mockFiles.get(this.uri).toString('utf8'); }
    async write(text) { await Promise.resolve(); mockFiles.set(this.uri, Buffer.from(text)); }
    async digest(algorithm) { if (!this.exists) throw new Error('missing'); const hash = crypto.createHash(algorithm.replace('-', '').toLowerCase()).update(mockFiles.get(this.uri)).digest('hex');
      if (mockMutateAfterDigest && this.name === 'study.json') mockFiles.set(this.uri, Buffer.from(mockFiles.get(this.uri).toString().replace('الكيمياء', 'الفيزياء')));
      return hash;
    }
    delete() { mockFiles.delete(this.uri); }
    async copy(target, options) { await Promise.resolve(); if (mockFailCopy) throw new Error('copy failed'); if (target.exists && !options?.overwrite) throw new Error('exists'); mockFiles.set(target.uri, Buffer.from(mockFiles.get(this.uri))); if (mockMutateAfterDigest && this.name === 'study.json') mockFiles.set(this.uri, Buffer.from(mockFiles.get(this.uri).toString().replace('الكيمياء', 'الفيزياء'))); if (mockCancelOnPendingCopy && target.uri.endsWith('.pending')) mockCancelled = true; }
    async move(target, options) { if (mockFailMetadataMove && target.name.endsWith('.json')) throw new Error('metadata move failed'); const old = this.uri; await this.copy(target, options); mockFiles.delete(old); this.uri = target.uri; }
  }
  class Directory {
    constructor(...parts) { this.uri = join(parts); }
    get name() { return this.uri.split('/').pop(); }
    get exists() { return mockDirectories.has(this.uri); }
    create(options) { if (this.exists && !options?.idempotent) throw new Error('exists'); mockDirectories.add(this.uri); }
    list() { return [...mockFiles.keys()].filter(k => k.startsWith(this.uri + '/') && !k.slice(this.uri.length + 1).includes('/')).map(k => new File(k)); }
  }
  return { File, Directory, Paths: { document: 'file:///app', cache: 'file:///cache' } };
});
import { Directory, File, Paths } from 'expo-file-system';
import { exportPortableFolder, inspectPortableFolder, mergePortableMedia } from '../src/backup/portable';
import { defaultWorkspace } from '../src/workspace';

const snapshot = () => ({ study: { format: 'rusukh-backup', version: 1, exportedAt: '2026-11-02T00:00:00.000Z',
  notes: [{ id: 'n1', title: 'الكيمياء', body: 'ملاحظة عربية', createdAt: 1, updatedAt: 1 }], cards: [], reviews: [] },
  preferences: { isDark: true, workspace: defaultWorkspace() } });
const photo = () => ({ version: 1, id: 'photo-1', kind: 'image', fileName: 'photo-1.jpg', title: 'صورة الدرس', mimeType: 'image/jpeg', createdAt: 1, sizeBytes: 5 });
function seedMedia(bytes = 'PHOTO', item = photo()) {
  mockFiles.set(`${Paths.document}/rusukh-media/${item.fileName}`, Buffer.from(bytes));
  mockFiles.set(`${Paths.document}/rusukh-media/${item.id}.json`, Buffer.from(JSON.stringify({ ...item, sizeBytes: Buffer.byteLength(bytes) })));
}
async function makeFolder() {
  seedMedia();
  return (await exportPortableFolder(new Directory('file:///user-files'), snapshot())).directory;
}
async function editManifest(folder, change) {
  const file = new File(folder, 'manifest.json'); const value = JSON.parse(await file.text()); change(value); await file.write(JSON.stringify(value));
}
beforeEach(() => {
  mockFiles.clear(); mockDirectories.clear(); mockFailCopy = false; mockFailMetadataMove = false;
  mockOversizeManifest = false; mockManifestRead = false; mockMutateAfterDigest = false; mockCancelOnPendingCopy = false; mockCancelled = false; Paths.document = 'file:///app';
});

test('exports study, media and safe preferences with verified hashes, then previews without changing current data', async () => {
  const folder = await makeFolder();
  const before = [...mockFiles.entries()].filter(([k]) => k.startsWith('file:///app'));
  const preview = await inspectPortableFolder(folder);
  expect(preview.study).toEqual(snapshot().study);
  expect(preview.preferences).toEqual(snapshot().preferences);
  expect(preview.manifest.media[0].item).toEqual(photo());
  expect(preview.manifest.media[0].sha256).toMatch(/^[a-f0-9]{64}$/);
  expect([...mockFiles.entries()].filter(([k]) => k.startsWith('file:///app'))).toEqual(before);
  expect(await new File(folder, 'manifest.json').text()).not.toContain('file:///');
});

test('awaits every file copy and leaves no completion manifest on failure', async () => {
  seedMedia(); mockFailCopy = true;
  await expect(exportPortableFolder(new Directory('file:///user-files'), snapshot())).rejects.toThrow('copy failed');
  expect([...mockFiles.keys()].filter(k => k.endsWith('/manifest.json'))).toHaveLength(0);
  expect(mockFiles.get('file:///app/rusukh-media/photo-1.jpg').toString()).toBe('PHOTO');
});

test('rejects same-size media corruption before import writes', async () => {
  const folder = await makeFolder(); await new File(folder, 'media', 'photo-1.jpg').write('WRONG');
  const before = mockFiles.size;
  await expect(inspectPortableFolder(folder)).rejects.toThrow('تغيّر');
  expect(mockFiles.size).toBe(before);
});

test('rejects tampered study text before parsing or changing the database', async () => {
  const folder = await makeFolder(); const file = new File(folder, 'study.json');
  await file.write((await file.text()).replace('الكيمياء', 'الفيزياء'));
  await expect(inspectPortableFolder(folder)).rejects.toThrow();
});

test('checks oversized manifest before reading JSON', async () => {
  const folder = await makeFolder(); mockOversizeManifest = true; mockManifestRead = false;
  await expect(inspectPortableFolder(folder)).rejects.toThrow('الحجم');
  expect(mockManifestRead).toBe(false);
});

test('rejects traversal filenames and duplicate media identities', async () => {
  const folder = await makeFolder();
  await editManifest(folder, m => { m.media.push(m.media[0]); });
  await expect(inspectPortableFolder(folder)).rejects.toThrow('مكررة');
  await editManifest(folder, m => { m.media = [m.media[0]]; m.media[0].item.fileName = '../outside.jpg'; });
  await expect(inspectPortableFolder(folder)).rejects.toThrow('غير صالحة');
});

test('revalidates the selected manifest before merging after preview', async () => {
  const folder = await makeFolder(); const preview = await inspectPortableFolder(folder);
  await editManifest(folder, m => { m.createdAt = '2026-11-03T00:00:00Z'; });
  await expect(mergePortableMedia(preview)).rejects.toThrow('بعد المعاينة');
});

test('merge on a different app container preserves metadata and is idempotent', async () => {
  const folder = await makeFolder(); const preview = await inspectPortableFolder(folder); Paths.document = 'file:///new-app';
  expect(await mergePortableMedia(preview)).toMatchObject({ added: 1, reused: 0 });
  expect(await mergePortableMedia(preview)).toMatchObject({ added: 0, reused: 1 });
  expect(JSON.parse(await new File(Paths.document, 'rusukh-media', 'photo-1.json').text())).toEqual(photo());
});

test('same id with different existing payload uses a stable new id and never overwrites', async () => {
  const folder = await makeFolder(); const preview = await inspectPortableFolder(folder); seedMedia('OLDER');
  expect(await mergePortableMedia(preview)).toMatchObject({ added: 1, reused: 0 });
  expect(await new File(Paths.document, 'rusukh-media', 'photo-1.jpg').text()).toBe('OLDER');
  expect(await mergePortableMedia(preview)).toMatchObject({ added: 0, reused: 1 });
  const imported = [...mockFiles.keys()].filter(k => k.includes('/rusukh-media/import-') && k.endsWith('.jpg'));
  expect(imported).toHaveLength(1); expect(mockFiles.get(imported[0]).toString()).toBe('PHOTO');
});

test('retry finishes metadata if interrupted after publishing the payload', async () => {
  const folder = await makeFolder(); const preview = await inspectPortableFolder(folder); Paths.document = 'file:///new-app';
  mockFailMetadataMove = true;
  await expect(mergePortableMedia(preview)).rejects.toThrow('metadata');
  mockFailMetadataMove = false;
  expect(await mergePortableMedia(preview)).toMatchObject({ added: 1, reused: 0 });
  expect([...mockFiles.keys()].filter(k => k.startsWith('file:///new-app/') && k.endsWith('.jpg'))).toHaveLength(1);
});

test('does not silently export unreadable library entries or active recording/model files', async () => {
  seedMedia(); mockFiles.set('file:///app/rusukh-media/broken.json', Buffer.from('{broken'));
  await expect(exportPortableFolder(new Directory('file:///user-files'), snapshot())).rejects.toThrow('وسائط');
  mockFiles.delete('file:///app/rusukh-media/broken.json');
  mockFiles.set('file:///app/model.gguf', Buffer.from('model'));
  mockFiles.set('file:///app/ExpoAudio/rusukh-recording-active.m4a', Buffer.from('unfinished'));
  const folder = (await exportPortableFolder(new Directory('file:///user-files'), snapshot())).directory;
  expect([...mockFiles.keys()].filter(k => k.startsWith(folder.uri))).toHaveLength(4);
});

test('only safe preference keys are exported; no notification ids or draft', async () => {
  seedMedia(); const input = snapshot();
  input.preferences.reminderId = 'system-notification-secret'; input.preferences.draft = 'unfinished';
  const { directory } = await exportPortableFolder(new Directory('file:///user-files'), input);
  const saved = await new File(directory, 'preferences.json').text();
  expect(saved).not.toContain('system-notification'); expect(saved).not.toContain('unfinished');
});

test('cancellation before export writes leaves user directory untouched', async () => {
  seedMedia(); const before = mockFiles.size;
  await expect(exportPortableFolder(new Directory('file:///user-files'), snapshot(), { isCancelled: () => true })).rejects.toThrow('أوقفت');
  expect(mockFiles.size).toBe(before); expect(mockDirectories.has('file:///user-files')).toBe(false);
});


test('hashes and reads the same owned JSON copy even if external study changes after hashing', async () => {
  const folder = await makeFolder(); mockMutateAfterDigest = true;
  const preview = await inspectPortableFolder(folder);
  expect(preview.study.notes[0].title).toBe('الكيمياء');
  expect(await new File(folder, 'study.json').text()).toContain('الفيزياء');
  expect([...mockFiles.keys()].filter(k => k.startsWith('file:///cache/'))).toHaveLength(0);
});

test('repeated cancellation cleans only attempt-owned unpublished payloads', async () => {
  const folder = await makeFolder(); const preview = await inspectPortableFolder(folder); Paths.document = 'file:///new-app';
  mockFiles.set('file:///new-app/rusukh-media/unrelated.pending', Buffer.from('keep'));
  for (let attempt = 0; attempt < 3; attempt++) {
    mockCancelled = false; mockCancelOnPendingCopy = true;
    await expect(mergePortableMedia(preview, { isCancelled: () => mockCancelled })).rejects.toThrow('أوقفت');
  }
  const leftovers = [...mockFiles.keys()].filter(k => k.startsWith('file:///new-app/') && k.endsWith('.pending'));
  expect(leftovers).toEqual(['file:///new-app/rusukh-media/unrelated.pending']);
  expect([...mockFiles.keys()].filter(k => k.startsWith('file:///cache/'))).toHaveLength(0);
});

test('round-trips audio payload and duration alongside photographs', async () => {
  seedMedia();
  const audio = { version: 1, id: 'audio-1', kind: 'audio', fileName: 'audio-1.m4a', title: 'شرح الدرس', mimeType: 'audio/mp4', createdAt: 2, sizeBytes: 5, durationMs: 2500 };
  seedMedia('SOUND', audio);
  const { directory } = await exportPortableFolder(new Directory('file:///user-files'), snapshot());
  const preview = await inspectPortableFolder(directory); Paths.document = 'file:///new-app';
  expect(await mergePortableMedia(preview)).toMatchObject({ added: 2, reused: 0 });
  expect(await new File(Paths.document, 'rusukh-media', 'audio-1.m4a').text()).toBe('SOUND');
  expect(JSON.parse(await new File(Paths.document, 'rusukh-media', 'audio-1.json').text())).toEqual(audio);
});
