import React from 'react';
import { Alert } from 'react-native';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react-native';
import App from '../App';
import { NOTE_DRAFT_KEY } from '../src/useNoteDraft';
import { defaultWorkspace, readWorkspace, WORKSPACE_KEY } from '../src/workspace';
import * as storage from '../src/storage';

// The panels have their own interaction tests. Capture their public callbacks to
// exercise App's real action lock, confirmation, state and useNoteDraft lifecycle.
let mockRecoveryProps;
let mockPortableProps;
const mockSettings = new Map();
const mockNotes = [{id:'n1',title:'ملاحظة أصلية',body:'محتوى محفوظ',createdAt:1,updatedAt:1}];
let mockData;
let mockDatabase;
let mockTransactions;
jest.mock('../src/backup/RecoveryPointsPanel', () => ({
  RecoveryPointsPanel: props => { mockRecoveryProps = props; return null; },
}));
jest.mock('../src/backup/PortableBackupPanel', () => ({
  PortableBackupPanel: props => { mockPortableProps = props; return null; },
}));
jest.mock('../src/reminders/RemindersPanel', () => ({RemindersPanel: () => null}));
jest.mock('../src/storage', () => ({
  openStorage: jest.fn(async () => mockDatabase),
  readAll: jest.fn(async () => mockData),
  getSetting: jest.fn(async (db,key) => (db.settings ?? mockSettings).get(key) ?? null),
  setSetting: jest.fn(async (db,key,value) => { (db.settings ?? mockSettings).set(key,value); }),
  makeBackup: jest.fn((notes,cards,reviews) => ({format:'rusukh-backup',version:1,exportedAt:'2026-11-02T00:00:00.000Z',notes,cards,reviews})),
  restoreBackup: jest.fn(async () => {}), restoreRecoveryPoint: jest.fn(async () => {}),
  saveNoteAndCards: jest.fn(), saveNote: jest.fn(), saveCard: jest.fn(),
  deleteNote: jest.fn(), deleteCard: jest.fn(), recordReview: jest.fn(),
}));
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('expo-symbols', () => ({SymbolView: () => null}));
jest.mock('expo-file-system', () => ({Paths:{cache:'/cache'},File: class {size=30;uri='/cache/file';text=async()=>'';create(){};write=async()=>{};}}));
jest.mock('expo-sharing', () => ({isAvailableAsync:jest.fn(async()=>true),shareAsync:jest.fn(async()=>{})}));
jest.mock('expo-document-picker', () => ({getDocumentAsync:jest.fn()}));

const point = {id:7,schemaVersion:1,createdAt:1,reason:'before-import',noteCount:1,cardCount:0,reviewCount:0,bytes:200};
const backup = {format:'rusukh-backup',version:1,exportedAt:'2026-11-02T00:00:00.000Z',notes:[],cards:[],reviews:[]};

beforeEach(() => {
  jest.useFakeTimers();
  mockSettings.clear(); mockRecoveryProps = undefined; mockPortableProps = undefined;
  mockData = {notes:mockNotes,cards:[],reviews:[]}; mockTransactions = [];
  // Deliberately distinct tx handles catch reads/writes accidentally using db.
  // This adapter checks App orchestration; real SQLite rollback is separately
  // exercised by backup-recovery.test.cjs and storage.test.cjs.
  mockDatabase = {withExclusiveTransactionAsync:jest.fn(async callback => {
    const tx = {settings:new Map(mockSettings)}; mockTransactions.push(tx);
    await callback(tx);
    mockSettings.clear(); for (const [key,value] of tx.settings) mockSettings.set(key,value);
  })};
  storage.readAll.mockImplementation(async () => mockData);
  storage.getSetting.mockImplementation(async (db,key) => (db.settings ?? mockSettings).get(key) ?? null);
  storage.setSetting.mockImplementation(async (db,key,value) => { (db.settings ?? mockSettings).set(key,value); });
  storage.restoreBackup.mockResolvedValue(undefined);
  storage.restoreRecoveryPoint.mockResolvedValue(undefined);
  jest.spyOn(Alert,'alert').mockImplementation(() => {});
});
afterEach(() => { jest.restoreAllMocks(); jest.useRealTimers(); });

async function openSettings() {
  await render(<App />); await screen.findByText('مساحتي');
  await fireEvent.press(screen.getByRole('tab',{name:'الإعدادات'}));
  await waitFor(() => expect(mockPortableProps).toBeTruthy());
}
async function editAndAutosave() {
  await fireEvent.press(screen.getByRole('tab',{name:'الرئيسية'}));
  await fireEvent.press(screen.getByRole('button',{name:'فتح ملاحظة أصلية'}));
  await fireEvent.changeText(screen.getByLabelText('المحتوى'),'مسودة عربية يجب ألا تضيع');
  await act(async () => { jest.advanceTimersByTime(701); });
  await waitFor(() => expect(JSON.parse(mockSettings.get(NOTE_DRAFT_KEY)).body).toBe('مسودة عربية يجب ألا تضيع'));
}
function restoreAlert() {
  const call = [...Alert.alert.mock.calls].reverse().find(call => call[0] === 'العودة إلى نقطة الاستعادة؟');
  expect(call).toBeTruthy(); return call;
}
function chooseRestore(text) {
  const button = restoreAlert()[2].find(item => item.text === text);
  expect(button).toBeTruthy(); button.onPress();
}
function draftWasCleared() {
  return storage.setSetting.mock.calls.some(([,key,value]) => key === NOTE_DRAFT_KEY && value === 'null');
}

test('recovery cancel and native dismissal both resolve false without changing content or draft', async () => {
  await openSettings(); await editAndAutosave();
  const previous = mockSettings.get(NOTE_DRAFT_KEY);
  let result;
  await act(async () => {
    const pending = mockRecoveryProps.onRestore(point); chooseRestore('إلغاء'); result = await pending;
  });
  expect(result).toBe(false);
  await act(async () => {
    const pending = mockRecoveryProps.onRestore(point); restoreAlert()[3].onDismiss(); result = await pending;
  });
  expect(result).toBe(false); expect(storage.restoreRecoveryPoint).not.toHaveBeenCalled();
  expect(mockSettings.get(NOTE_DRAFT_KEY)).toBe(previous); expect(draftWasCleared()).toBe(false);
  expect(screen.getByLabelText('المحتوى').props.value).toBe('مسودة عربية يجب ألا تضيع');
});

test('confirmed SQL recovery failure preserves the live editor and persisted draft', async () => {
  await openSettings(); await editAndAutosave();
  storage.restoreRecoveryPoint.mockRejectedValueOnce(new Error('SQLITE_FULL'));
  let result;
  await act(async () => {
    const pending = mockRecoveryProps.onRestore(point); chooseRestore('استعادة'); result = await pending;
  });
  expect(result).toBe(false); expect(storage.restoreRecoveryPoint).toHaveBeenCalledWith(mockDatabase,7);
  expect(draftWasCleared()).toBe(false);
  expect(JSON.parse(mockSettings.get(NOTE_DRAFT_KEY)).body).toBe('مسودة عربية يجب ألا تضيع');
  expect(screen.getByLabelText('المحتوى').props.value).toBe('مسودة عربية يجب ألا تضيع');
  expect(screen.getByLabelText('المحتوى').props.editable).not.toBe(false);
  expect(Alert.alert).toHaveBeenCalledWith('تعذّر إكمال العملية',expect.stringContaining('SQLITE_FULL'));
});

test('successful recovery clears the old draft and closes the editor only after the SQL operation finishes', async () => {
  await openSettings(); await editAndAutosave();
  let release;
  storage.restoreRecoveryPoint.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
  let pending;
  await act(async () => { pending = mockRecoveryProps.onRestore(point); chooseRestore('استعادة'); });
  expect(draftWasCleared()).toBe(false); expect(screen.getByLabelText('المحتوى')).toBeTruthy();
  let result;
  await act(async () => { release(); result = await pending; });
  expect(result).toBe(true); expect(mockSettings.get(NOTE_DRAFT_KEY)).toBe('null');
  expect(screen.queryByLabelText('المحتوى')).toBeNull();
  await act(async () => { jest.advanceTimersByTime(1500); });
  expect(mockSettings.get(NOTE_DRAFT_KEY)).toBe('null');
});

test('portable study failure also preserves an unpublished note', async () => {
  await openSettings(); await editAndAutosave();
  storage.restoreBackup.mockRejectedValueOnce(new Error('SQLITE_BUSY'));
  let result; await act(async () => { result = await mockPortableProps.restoreStudy(backup); });
  expect(result).toBe(false); expect(storage.restoreBackup).toHaveBeenCalledWith(mockDatabase,backup);
  expect(draftWasCleared()).toBe(false); expect(screen.getByLabelText('المحتوى').props.value).toBe('مسودة عربية يجب ألا تضيع');
});

test('portable study success goes through protected restore and clears the previous draft', async () => {
  await openSettings(); await editAndAutosave();
  let result; await act(async () => { result = await mockPortableProps.restoreStudy(backup); });
  expect(result).toBe(true); expect(storage.restoreBackup).toHaveBeenCalledWith(mockDatabase,backup);
  expect(mockSettings.get(NOTE_DRAFT_KEY)).toBe('null'); expect(screen.queryByLabelText('المحتوى')).toBeNull();
});

test('preference import writes only presentation keys through one exclusive transaction', async () => {
  const reminderKey = 'reminders.v1';
  mockSettings.set(reminderKey,'existing-local-notification-id');
  mockSettings.set(NOTE_DRAFT_KEY,'null');
  await openSettings(); storage.setSetting.mockClear();
  const workspace = {...defaultWorkspace(),density:'compact'};
  await act(async () => { await mockPortableProps.applyPreferences({isDark:true,workspace,
    [reminderKey]:'foreign-notification-id',noteDraft:{body:'foreign draft'},unknown:'ignore'}); });
  expect(mockDatabase.withExclusiveTransactionAsync).toHaveBeenCalledTimes(1);
  expect(storage.setSetting.mock.calls).toEqual([
    [mockTransactions[0],'darkMode','true'],
    [mockTransactions[0],WORKSPACE_KEY,JSON.stringify(readWorkspace(JSON.stringify(workspace)))],
  ]);
  expect(mockSettings.get(reminderKey)).toBe('existing-local-notification-id');
  expect(mockSettings.get(NOTE_DRAFT_KEY)).toBe('null'); expect(mockSettings.has('unknown')).toBe(false);
  expect(screen.getByText('المظهر الداكن')).toBeTruthy();
});

test('failure on the second preference write rolls back the first and leaves rendered preferences unchanged', async () => {
  mockSettings.set('darkMode','false'); mockSettings.set(WORKSPACE_KEY,JSON.stringify(defaultWorkspace()));
  await openSettings();
  storage.setSetting.mockImplementation(async (db,key,value) => {
    if (key === WORKSPACE_KEY) throw new Error('SQLITE_FULL');
    (db.settings ?? mockSettings).set(key,value);
  });
  let error;
  await act(async () => {
    try { await mockPortableProps.applyPreferences({isDark:true,workspace:{...defaultWorkspace(),density:'compact'}}); }
    catch (caught) { error = caught; }
  });
  expect(error).toBeInstanceOf(Error);
  expect(mockSettings.get('darkMode')).toBe('false');
  expect(mockSettings.get(WORKSPACE_KEY)).toBe(JSON.stringify(defaultWorkspace()));
  expect(screen.getByText('المظهر الفاتح')).toBeTruthy();
});

test('portable snapshot reads fresh study content and safe preferences using the same transaction handle', async () => {
  await openSettings(); storage.readAll.mockClear(); storage.getSetting.mockClear();
  const freshNote = {...mockNotes[0],body:'أحدث من البيانات المعروضة'};
  mockData = {notes:[freshNote],cards:[],reviews:[]};
  mockSettings.set('darkMode','true');
  mockSettings.set(WORKSPACE_KEY,JSON.stringify({...defaultWorkspace(),density:'compact'}));
  mockSettings.set('reminders.v1','private-local-notification-id');
  let snapshot; await act(async () => { snapshot = await mockPortableProps.getSnapshot(); });
  expect(mockDatabase.withExclusiveTransactionAsync).toHaveBeenCalledTimes(1);
  expect(storage.readAll.mock.calls).toEqual([[mockTransactions[0]]]);
  expect(storage.getSetting.mock.calls).toEqual([[mockTransactions[0],'darkMode'],[mockTransactions[0],WORKSPACE_KEY]]);
  expect(snapshot.study.notes).toEqual([freshNote]);
  expect(snapshot.preferences.isDark).toBe(true); expect(snapshot.preferences.workspace.density).toBe('compact');
  expect(Object.keys(snapshot.preferences).sort()).toEqual(['isDark','workspace']);
  expect(storage.setSetting).not.toHaveBeenCalled();
});

test('snapshot read failure rejects instead of exporting stale in-memory study content', async () => {
  await openSettings(); storage.makeBackup.mockClear();
  storage.readAll.mockRejectedValueOnce(new Error('SQLITE_IOERR'));
  await expect(mockPortableProps.getSnapshot()).rejects.toThrow('SQLITE_IOERR');
  expect(storage.makeBackup).not.toHaveBeenCalled(); expect(storage.setSetting).not.toHaveBeenCalled();
});
