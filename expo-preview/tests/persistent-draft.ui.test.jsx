import { AppState } from 'react-native';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { usePersistentDraft } from '../src/usePersistentDraft';
import * as storage from '../src/storage';
import { CARD_DRAFT_KEY, validCardDraft } from '../src/studyDrafts';

const mockSettings = new Map();
jest.mock('../src/storage', () => ({
  getSetting: jest.fn(async (_, key) => mockSettings.get(key) ?? null),
  setSetting: jest.fn(async (_, key, value) => { mockSettings.set(key, value); }),
}));
const KEY = 'reviewPersistent.v1';
const valid = value => !!value && typeof value === 'object' && typeof value.text === 'string';
let background, appStateSpy;
const deferred = () => { let resolve, reject; const promise = new Promise((yes,no) => {resolve=yes;reject=no;}); return {promise,resolve,reject}; };
beforeEach(() => {
  mockSettings.clear();
  storage.getSetting.mockImplementation(async (_,key) => mockSettings.get(key) ?? null);
  storage.setSetting.mockImplementation(async (_,key,value) => {mockSettings.set(key,value);});
  appStateSpy = jest.spyOn(AppState,'addEventListener').mockImplementation((_,callback) => {background=callback;return {remove:jest.fn()};});
});
afterEach(() => appStateSpy.mockRestore());
async function ready() {
  const db={}; const hook=await renderHook(() => usePersistentDraft(db,KEY,valid));
  await waitFor(() => expect(hook.result.current.loading).toBe(false));
  return hook;
}

test('explicit discard cannot be undone by AppState flush while its tombstone write is pending', async () => {
  const hook=await ready();const gate=deferred();
  await act(() => {expect(hook.result.current.update({text:'draft before discard'})).toBe(true);});
  storage.setSetting.mockImplementationOnce(async(_,key,value) => {await gate.promise;mockSettings.set(key,value);});
  let discard, flushed;
  await act(async () => {discard=hook.result.current.clear();});
  expect(storage.setSetting.mock.calls[0][2]).toBe('null');
  await act(() => {background('inactive');flushed=hook.result.current.flush();});
  await act(async () => {gate.resolve();expect(await discard).toBe(true);await flushed;});
  expect(hook.result.current.value).toBeNull();
  expect(hook.result.current.getCurrent()).toBeNull();
  expect(mockSettings.get(KEY)).toBe('null');
  expect(hook.result.current.status).toBe('idle');
});

test('new text accepted during a pending clear survives that older clear and background flushing', async () => {
  const hook=await ready();
  await act(() => {hook.result.current.update({text:'old'});});
  await act(async () => {await hook.result.current.flush();});
  const gate=deferred();storage.setSetting.mockImplementationOnce(async(_,key,value)=>{await gate.promise;mockSettings.set(key,value);});
  let discard,flushed;
  await act(async () => {discard=hook.result.current.clear();});
  await act(() => {expect(hook.result.current.update({text:'new accepted text'})).toBe(true);background('inactive');flushed=hook.result.current.flush();});
  await act(async () => {gate.resolve();await discard;await flushed;});
  expect(hook.result.current.value).toEqual({text:'new accepted text'});
  expect(JSON.parse(mockSettings.get(KEY))).toEqual({text:'new accepted text'});
});

test('a failed explicit clear keeps the draft recoverable and reports failure', async () => {
  mockSettings.set(KEY,JSON.stringify({text:'saved before discard'}));const hook=await ready();
  storage.setSetting.mockRejectedValueOnce(new Error('disk full'));
  await act(async () => {expect(await hook.result.current.clear()).toBe(false);});
  expect(hook.result.current.value).toEqual({text:'saved before discard'});
  expect(hook.result.current.getCurrent()).toEqual({text:'saved before discard'});
  expect(hook.result.current.status).toBe('error');
  expect(JSON.parse(mockSettings.get(KEY))).toEqual({text:'saved before discard'});
});

test('a slow old write and a later background flush finish with the newest accepted text', async () => {
  const hook=await ready();const gate=deferred();
  storage.setSetting.mockImplementationOnce(async(_,key,value)=>{await gate.promise;mockSettings.set(key,value);});
  let first,last;
  await act(async () => {hook.result.current.update({text:'first'});first=hook.result.current.flush();});
  await act(() => {hook.result.current.update({text:'latest'});background('background');last=hook.result.current.flush();});
  await act(async () => {gate.resolve();await first;await last;});
  expect(hook.result.current.value).toEqual({text:'latest'});
  expect(JSON.parse(mockSettings.get(KEY))).toEqual({text:'latest'});
  expect(hook.result.current.status).toBe('saved');
});

test('a failed initial read blocks editing without replacing unread disk content', async () => {
  mockSettings.set(KEY,'{unread');const hook=await ready();
  expect(hook.result.current.status).toBe('error');
  await act(() => {expect(hook.result.current.update({text:'replacement'})).toBe(false);});
  expect(storage.setSetting).not.toHaveBeenCalled();expect(mockSettings.get(KEY)).toBe('{unread');
});


test('an accepted card draft with JSON-escaped characters can be recovered after restart', async () => {
  const db={};const input={version:1,noteId:'n1',noteCreatedAt:1,cardId:null,question:'\u0001'.repeat(600000),answer:'\u0002'.repeat(600000)};
  expect(validCardDraft(input)).toBe(true);
  const hook=await renderHook(()=>usePersistentDraft(db,CARD_DRAFT_KEY,validCardDraft));
  await waitFor(()=>expect(hook.result.current.loading).toBe(false));
  await act(()=>{expect(hook.result.current.update(input)).toBe(true);});
  await act(async()=>{expect(await hook.result.current.flush()).toBe(true);});
  await hook.unmount();
  const recovered=await renderHook(()=>usePersistentDraft(db,CARD_DRAFT_KEY,validCardDraft));
  await waitFor(()=>expect(recovered.result.current.loading).toBe(false));
  expect(recovered.result.current.status).toBe('saved');
  expect(recovered.result.current.value).toEqual(input);
});

test('unmount cleanup cannot resurrect a draft while explicit discard is pending',async()=>{
 const hook=await ready();const gate=deferred();
 await act(()=>{hook.result.current.update({text:'discard before unmount'});});
 storage.setSetting.mockImplementationOnce(async(_,key,value)=>{await gate.promise;mockSettings.set(key,value);});
 let discard;
 await act(async()=>{discard=hook.result.current.clear();});
 await hook.unmount();
 await act(async()=>{gate.resolve();await discard;await Promise.resolve();await Promise.resolve();});
 expect(mockSettings.get(KEY)).toBe('null');
});
