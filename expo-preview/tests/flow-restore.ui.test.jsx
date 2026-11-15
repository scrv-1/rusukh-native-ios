import React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import App from '../App';
import * as storage from '../src/storage';
import { createDatabaseSnapshot } from '../src/databaseSnapshot';
import { NOTE_DRAFT_KEY } from '../src/useNoteDraft';
import { SOURCE_DRAFT_KEY, CARD_DRAFT_KEY, emptySourceForm } from '../src/studyDrafts';
import { AI_STUDY_SESSION_KEY } from '../src/ai/useAIStudySession';
import { WORKSPACE_KEY, workspacePreset } from '../src/workspace';

// App and all recovery hooks are real. Panel callbacks exercise App's restore
// orchestration; storage/file picker/native sharing are deterministic adapters.
const mockSettings = new Map();
const mockDatabase = {};
const mockNotes = [{ id: 'n1', title: 'ملاحظة أصلية', body: 'نص منشور', createdAt: 1, updatedAt: 1 }];
const mockCards = [{ id: 'c1', noteId: 'n1', question: 'سؤال قديم؟', answer: 'جواب قديم', dueAt: 9999999999999, intervalDays: 8, ease: 2.5, repetitions: 3, updatedAt: 1 }];
let mockRecoveryProps, mockPortableProps, mockFileText;
jest.mock('../src/backup/RecoveryPointsPanel', () => ({ RecoveryPointsPanel: props => { mockRecoveryProps = props; return null; } }));
jest.mock('../src/backup/PortableBackupPanel', () => ({ PortableBackupPanel: props => { mockPortableProps = props; return null; } }));
jest.mock('../src/reminders/RemindersPanel', () => ({ RemindersPanel: () => null }));
jest.mock('../src/ai/LocalAILab', () => ({ LocalAILab: () => null }));
jest.mock('../src/storage', () => ({
  openStorage: jest.fn(async () => mockDatabase),
  readAll: jest.fn(async () => ({ notes: mockNotes, cards: mockCards, reviews: [] })),
  getSetting: jest.fn(async (_, key) => mockSettings.get(key) ?? null),
  setSetting: jest.fn(async (_, key, value) => { mockSettings.set(key, value); }),
  restoreBackup: jest.fn(async () => {}), restoreRecoveryPoint: jest.fn(async () => {}),
  saveNoteAndCards: jest.fn(), saveNote: jest.fn(), saveCard: jest.fn(), updateCard: jest.fn(),
  makeBackup: jest.fn(), deleteNote: jest.fn(), deleteCard: jest.fn(), recordReview: jest.fn(),
}));
jest.mock('../src/databaseSnapshot', () => ({ createDatabaseSnapshot: jest.fn() }));
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
// The installed SDK returns a Directory, not a string, from Paths.cache.
jest.mock('expo-file-system', () => ({ Paths: { cache: { uri: 'file:///cache/' } }, File: class { size = 30; uri = 'file:///cache/file'; text = async () => mockFileText; create() {} write() {} } }));
jest.mock('expo-sharing', () => ({ isAvailableAsync: jest.fn(async () => true), shareAsync: jest.fn(async () => {}) }));
jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }));

const backup = { format: 'rusukh-backup', version: 1, exportedAt: '2026-11-03T00:00:00.000Z', notes: [], cards: [], reviews: [] };
const point = { id: 7, schemaVersion: 1, createdAt: 1, reason: 'before-import', noteCount: 0, cardCount: 0, reviewCount: 0, bytes: 200 };
const fixtures = [
  [SOURCE_DRAFT_KEY, { ...emptySourceForm(), pastedText: 'مادة لم تنشر' }],
  [CARD_DRAFT_KEY, { version: 1, noteId: 'n1', noteCreatedAt: 1, cardId: 'c1', question: 'سؤال مصحح؟', answer: 'جواب لم ينشر' }],
  [AI_STUDY_SESSION_KEY, { version: 1, sourceText: 'مصدر مساعد لم ينشر', sourceTitle: 'المصدر', sourceNote: null, result: null }],
];
const draftKeys = [NOTE_DRAFT_KEY, SOURCE_DRAFT_KEY, CARD_DRAFT_KEY, AI_STUDY_SESSION_KEY];
const paths = ['json', 'folder', 'point'];
function deferred() { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; }
beforeEach(() => {
  jest.useFakeTimers();
  mockSettings.clear(); mockSettings.set(WORKSPACE_KEY, JSON.stringify(workspacePreset('simple')));
  mockRecoveryProps = undefined; mockPortableProps = undefined; mockFileText = JSON.stringify(backup);
  storage.getSetting.mockImplementation(async (_, key) => mockSettings.get(key) ?? null);
  storage.setSetting.mockImplementation(async (_, key, value) => { mockSettings.set(key, value); });
  storage.restoreBackup.mockResolvedValue(undefined); storage.restoreRecoveryPoint.mockResolvedValue(undefined);
  DocumentPicker.getDocumentAsync.mockReset();
  Sharing.isAvailableAsync.mockResolvedValue(true); Sharing.shareAsync.mockResolvedValue(undefined);
  createDatabaseSnapshot.mockReset();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});
afterEach(() => { jest.restoreAllMocks(); jest.useRealTimers(); });

async function openSettings() {
  await render(<App />); await screen.findByText('مساحتي');
  await fireEvent.press(screen.getByRole('tab', { name: 'الإعدادات' }));
  await waitFor(() => expect(mockPortableProps).toBeTruthy());
}
function alertButton(title, label) {
  const alert = [...Alert.alert.mock.calls].reverse().find(call => call[0] === title);
  expect(alert).toBeTruthy(); const button = alert[2].find(item => item.text === label);
  expect(button).toBeTruthy(); return button;
}
async function restore(path) {
  if (path === 'json') {
    DocumentPicker.getDocumentAsync.mockResolvedValueOnce({ canceled: false, assets: [{ uri: 'file:///backup.json', size: 30 }] });
    await fireEvent.press(screen.getByRole('button', { name: 'استيراد نسخة من الملفات' }));
    await act(async () => { alertButton('استبدال البيانات الحالية؟', 'استبدال').onPress(); });
  } else await act(async () => {
    if (path === 'folder') expect(await mockPortableProps.restoreStudy(backup)).toBe(false);
    else { const pending = mockRecoveryProps.onRestore(point); alertButton('العودة إلى نقطة الاستعادة؟', 'استعادة').onPress(); expect(await pending).toBe(false); }
  });
}
function expectProtected() {
  expect(storage.restoreBackup).not.toHaveBeenCalled(); expect(storage.restoreRecoveryPoint).not.toHaveBeenCalled();
  expect(storage.setSetting.mock.calls.filter(([, key, value]) => draftKeys.includes(key) && value === 'null')).toEqual([]);
  expect(Alert.alert.mock.calls.some(([title]) => title === 'تعذّر إكمال العملية')).toBe(true);
}

test.each(fixtures.flatMap(([key, value]) => paths.map(path => [key, path, value])))('%s retained recovery slot blocks %s restore with editor closed', async (key, path, value) => {
  const original = JSON.stringify(value); mockSettings.set(key, original);
  await openSettings(); await restore(path);
  expectProtected(); expect(mockSettings.get(key)).toBe(original);
});

test.each(paths.flatMap(path => [false, true].map(tombstones => [path, tombstones])))('%s restore succeeds when every slot is empty (persisted tombstones: %s)', async (path, tombstones) => {
  if (tombstones) for (const key of draftKeys) mockSettings.set(key, 'null');
  await openSettings(); storage.getSetting.mockClear();
  if (path === 'json') await restore(path);
  else await act(async () => {
    if (path === 'folder') expect(await mockPortableProps.restoreStudy(backup)).toBe(true);
    else { const pending = mockRecoveryProps.onRestore(point); alertButton('العودة إلى نقطة الاستعادة؟', 'استعادة').onPress(); expect(await pending).toBe(true); }
  });
  expect(path === 'point' ? storage.restoreRecoveryPoint : storage.restoreBackup).toHaveBeenCalledTimes(1);
  for (const key of draftKeys) expect(storage.getSetting).toHaveBeenCalledWith(mockDatabase, key);
  expect(storage.setSetting.mock.calls.filter(([, key]) => draftKeys.includes(key))).toEqual([]);
});

test.each(fixtures)('%s initial recovery read failure blocks replacement and preserves unread bytes', async (key, value) => {
  const original = JSON.stringify(value); mockSettings.set(key, original);
  storage.getSetting.mockImplementation(async (_, requested) => { if (requested === key) throw new Error('SQLITE_IOERR'); return mockSettings.get(requested) ?? null; });
  await openSettings(); await restore('folder');
  expectProtected(); expect(mockSettings.get(key)).toBe(original);
});

test.each(fixtures)('%s commit-time read failure blocks SQL even after an empty successful startup', async key => {
  await openSettings();
  storage.getSetting.mockImplementation(async (_, requested) => { if (requested === key) throw new Error('SQLITE_IOERR commit read'); return mockSettings.get(requested) ?? null; });
  await restore('folder'); expectProtected();
  expect(storage.getSetting).toHaveBeenCalledWith(mockDatabase, key);
});

test.each(fixtures)('%s slot written outside the mounted hook is rechecked immediately before restore', async (key, value) => {
  await openSettings(); const delayedRestore = mockPortableProps.restoreStudy;
  const original = JSON.stringify(value); mockSettings.set(key, original);
  await act(async () => { expect(await delayedRestore(backup)).toBe(false); });
  expectProtected(); expect(mockSettings.get(key)).toBe(original);
});

async function createPendingDraft(key) {
  if (key === CARD_DRAFT_KEY) {
    await fireEvent.press(screen.getByRole('tab', { name: 'المراجعة' }));
    await fireEvent.press(screen.getByRole('button', { name: 'إدارة البطاقات (1)' }));
    await fireEvent.press(screen.getByRole('button', { name: 'تعديل سؤال قديم؟' }));
    await fireEvent.changeText(screen.getByLabelText('الإجابة'), 'تعديل أثناء اختيار النسخة');
  } else {
    await fireEvent.press(screen.getByRole('tab', { name: 'الأدوات' }));
    await fireEvent.press(screen.getByRole('button', { name: key === SOURCE_DRAFT_KEY ? 'فتح مصادري' : 'فتح مساعد الدراسة المحلي' }));
    await fireEvent.changeText(screen.getByLabelText(key === SOURCE_DRAFT_KEY ? 'النص الذي تريد دراسته' : 'النص المصدري للمساعد'), 'نص جديد أثناء اختيار النسخة');
  }
  await act(async () => { jest.advanceTimersByTime(351); });
}
test.each(fixtures)('%s write started after JSON picker opened cannot be discarded by the old import callback', async key => {
  await openSettings(); const selection = deferred(), write = deferred();
  DocumentPicker.getDocumentAsync.mockReturnValueOnce(selection.promise);
  await fireEvent.press(screen.getByRole('button', { name: 'استيراد نسخة من الملفات' }));
  storage.setSetting.mockImplementation(async (_, requested, value) => { if (requested === key) await write.promise; mockSettings.set(requested, value); });
  await createPendingDraft(key);
  expect(storage.setSetting.mock.calls.some(([, requested]) => requested === key)).toBe(true);
  expect(mockSettings.has(key)).toBe(false);
  await act(async () => { selection.resolve({ canceled: false, assets: [{ uri: 'file:///backup.json', size: 30 }] }); await selection.promise; });
  await act(async () => { alertButton('استبدال البيانات الحالية؟', 'استبدال').onPress(); });
  expectProtected(); expect(mockSettings.has(key)).toBe(false);
  await act(async () => { write.resolve(); await write.promise; });
  await waitFor(() => expect(mockSettings.has(key)).toBe(true));
  const saved = JSON.parse(mockSettings.get(key));
  expect(key === CARD_DRAFT_KEY ? saved.answer : key === SOURCE_DRAFT_KEY ? saved.pastedText : saved.sourceText).toContain('أثناء اختيار النسخة');
  expectProtected();
});

test('Settings rescue action supplies the SDK Directory URI and shares only a completed snapshot', async () => {
  await openSettings(); const copy = deferred(); createDatabaseSnapshot.mockReturnValueOnce(copy.promise);
  await fireEvent.press(screen.getByRole('button', { name: 'تصدير نسخة إنقاذ SQLite' }));
  expect(createDatabaseSnapshot).toHaveBeenCalledWith(mockDatabase, 'file:///cache/');
  expect(Sharing.shareAsync).not.toHaveBeenCalled();
  await act(async () => { copy.resolve({ uri: 'file:///cache/verified.sqlite' }); await copy.promise; });
  expect(Sharing.shareAsync).toHaveBeenCalledWith('file:///cache/verified.sqlite', { mimeType: 'application/vnd.sqlite3' });
  expect(storage.restoreBackup).not.toHaveBeenCalled();
  expect(screen.getByText(/لا يدعم التطبيق استيراده حاليًا/)).toBeTruthy();
});

test('failed rescue snapshot is not shared and the action lock permits a retry', async () => {
  await openSettings(); createDatabaseSnapshot.mockRejectedValueOnce(new Error('integrity check failed'));
  await fireEvent.press(screen.getByRole('button', { name: 'تصدير نسخة إنقاذ SQLite' }));
  expect(Sharing.shareAsync).not.toHaveBeenCalled();
  expect(Alert.alert).toHaveBeenCalledWith('تعذّر إنشاء نسخة الإنقاذ', expect.stringContaining('integrity check failed'));
  createDatabaseSnapshot.mockResolvedValueOnce({ uri: 'file:///cache/retry.sqlite' });
  await fireEvent.press(screen.getByRole('button', { name: 'تصدير نسخة إنقاذ SQLite' }));
  expect(createDatabaseSnapshot).toHaveBeenCalledTimes(2);
  expect(Sharing.shareAsync).toHaveBeenCalledWith('file:///cache/retry.sqlite', { mimeType: 'application/vnd.sqlite3' });
});
