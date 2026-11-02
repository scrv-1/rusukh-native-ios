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
import { saveCapturedMedia, loadMediaLibrary, mediaUri, isMediaItem, trackActiveRecording } from '../../../../src/media/library';

beforeEach(() => { mockFiles.clear(); mockDirectories.clear(); mockFailWrite = false; mockFailCopy = false; Paths.document = 'file:///documents'; });
const photo = { id: 'photo-1', kind: 'image', uri: 'file:///cache/photo.jpg', mimeType: 'image/jpeg', title: 'ملاحظات المحاضرة' };
const seedPhoto = () => { mockFiles.set(photo.uri, 'real image bytes'); };


test('D004 observed: photo payload stranded after metadata failure and source-cache loss', async()=>{
  seedPhoto();mockFailWrite=true;
  await expect(saveCapturedMedia(photo)).rejects.toThrow('disk full');
  expect(mockFiles.has('file:///documents/rusukh-media/photo-1.jpg')).toBe(true);
  mockFailWrite=false;mockFiles.delete(photo.uri);
  const recovered=await loadMediaLibrary(true);
  expect(recovered).toEqual({items:[],warnings:[]});
  await expect(saveCapturedMedia(photo)).rejects.toThrow('لا يوجد ملف مكتمل');
  console.log('D004 REPRODUCED',JSON.stringify({durablePayloadStillExists:true,visibleAfterRecovery:recovered.items.length,warnings:recovered.warnings,sourceCacheAvailable:false,retryRejected:true}));
});
