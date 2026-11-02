import { act, renderHook, waitFor } from '@testing-library/react-native';
import { NOTE_DRAFT_KEY, useNoteDraft } from '../src/useNoteDraft';
import * as storage from '../src/storage';

const mockSettings = new Map();
jest.mock('../src/storage', () => ({
  getSetting: jest.fn(async (_, key) => mockSettings.get(key) ?? null),
  setSetting: jest.fn(async (_, key, value) => { mockSettings.set(key, value); }),
}));
const draft = { editingId: 'n1', title: 'ملاحظتي', body: 'نص عربي', updatedAt: 10 };
beforeEach(() => {
  mockSettings.clear();
  storage.getSetting.mockImplementation(async (_, key) => mockSettings.get(key) ?? null);
  storage.setSetting.mockImplementation(async (_, key, value) => { mockSettings.set(key, value); });
});
async function ready(db = {}) {
  const hook = await renderHook(() => useNoteDraft(db));
  await waitFor(() => expect(hook.result.current.loading).toBe(false));
  return hook;
}

test('recovers a saved draft on restart without writing or creating notes', async () => {
  mockSettings.set(NOTE_DRAFT_KEY, JSON.stringify({ ...draft, version: 1 }));
  const hook = await ready();
  expect(hook.result.current.recoveredDraft).toEqual({ ...draft, version: 1 });
  expect(hook.result.current.status).toBe('saved');
  expect(storage.setSetting).not.toHaveBeenCalled();
});

test('serializes two saves followed by clear so a late save cannot restore a discarded draft', async () => {
  const hook = await ready();
  let release;
  const blocked = new Promise(resolve => { release = resolve; });
  storage.setSetting.mockImplementationOnce(async (_, key, value) => {
    await blocked; mockSettings.set(key, value);
  });
  let first, second, cleared;
  await act(async () => {
    first = hook.result.current.persist(draft);
    second = hook.result.current.persist({ ...draft, body: 'أحدث' });
    cleared = hook.result.current.clear();
  });
  expect(storage.setSetting).toHaveBeenCalledTimes(1);
  expect(hook.result.current.status).toBe('saving');
  await act(async () => { release(); expect(await first).toBe(true); expect(await second).toBe(true); expect(await cleared).toBe(true); });
  expect(storage.setSetting).toHaveBeenCalledTimes(3);
  expect(mockSettings.get(NOTE_DRAFT_KEY)).toBe('null');
  expect(hook.result.current.recoveredDraft).toBeNull();
  expect(hook.result.current.status).toBe('idle');
});

test('failed write retains previous recovery draft and exposes error; retry succeeds', async () => {
  mockSettings.set(NOTE_DRAFT_KEY, JSON.stringify({ ...draft, version: 1 }));
  const hook = await ready();
  storage.setSetting.mockRejectedValueOnce(new Error('disk full'));
  await act(async () => { expect(await hook.result.current.persist({ ...draft, body: 'تعديل' })).toBe(false); });
  expect(hook.result.current.status).toBe('error');
  expect(hook.result.current.recoveredDraft.body).toBe('نص عربي');
  await act(async () => { expect(await hook.result.current.persist({ ...draft, body: 'تعديل' })).toBe(true); });
  expect(hook.result.current.status).toBe('saved');
  expect(hook.result.current.recoveredDraft.body).toBe('تعديل');
});

test('when the latest queued write fails recovery still reflects the last successful write', async () => {
  const hook = await ready();
  storage.setSetting.mockImplementationOnce(async (_, key, value) => { mockSettings.set(key, value); });
  storage.setSetting.mockRejectedValueOnce(new Error('disk full'));
  let first, second;
  await act(async () => {
    first = hook.result.current.persist(draft);
    second = hook.result.current.persist({ ...draft, body: 'لم يحفظ' });
    expect(await first).toBe(true);
    expect(await second).toBe(false);
  });
  expect(hook.result.current.recoveredDraft.body).toBe(draft.body);
  expect(hook.result.current.status).toBe('error');
});

test.each(['{broken', JSON.stringify({ ...draft, version: 9 }), JSON.stringify({ ...draft, version: 1, title: 'x'.repeat(161) })])('invalid saved draft is reported and never erased: %s', async raw => {
  mockSettings.set(NOTE_DRAFT_KEY, raw);
  const hook = await ready();
  expect(hook.result.current.status).toBe('error');
  expect(hook.result.current.recoveredDraft).toBeNull();
  expect(mockSettings.get(NOTE_DRAFT_KEY)).toBe(raw);
  expect(storage.setSetting).not.toHaveBeenCalled();
});

test('invalid new content is rejected before storage', async () => {
  const hook = await ready();
  await act(async () => { expect(await hook.result.current.persist({ ...draft, body: 'x'.repeat(1_000_001) })).toBe(false); });
  expect(storage.setSetting).not.toHaveBeenCalled();
  expect(hook.result.current.status).toBe('error');
});

test('recovery read cannot overwrite a newer queued edit', async () => {
  let release;
  const pendingRead = new Promise(resolve => { release = resolve; });
  storage.getSetting.mockReturnValueOnce(pendingRead);
  const db = {};
  const hook = await renderHook(() => useNoteDraft(db));
  let save;
  await act(async () => { save = hook.result.current.persist({ ...draft, body: 'الجديد' }); });
  await act(async () => { release(JSON.stringify({ ...draft, version: 1 })); await save; });
  expect(hook.result.current.loading).toBe(false);
  expect(hook.result.current.recoveredDraft.body).toBe('الجديد');
  expect(hook.result.current.status).toBe('saved');
});

test('pending persistence can finish after unmount without invoking React updates', async () => {
  const hook = await ready();
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  storage.setSetting.mockImplementationOnce(async (_, key, value) => { await pending; mockSettings.set(key, value); });
  let save;
  await act(async () => { save = hook.result.current.persist(draft); });
  await hook.unmount();
  release();
  expect(await save).toBe(true);
  expect(JSON.parse(mockSettings.get(NOTE_DRAFT_KEY)).body).toBe(draft.body);
});
