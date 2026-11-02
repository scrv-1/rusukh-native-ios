import React from 'react';
import { Alert } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react-native';
import App from '../App';
import { NOTE_DRAFT_KEY } from '../src/useNoteDraft';
import { defaultWorkspace, readWorkspace, workspacePreset, WORKSPACE_KEY } from '../src/workspace';
import * as storage from '../src/storage';

// The panels have their own interaction tests. Capture their public callbacks to
// exercise App's real action lock, confirmation, state and useNoteDraft lifecycle.
let mockRecoveryProps;
let mockStudyHomeProps;
let mockPortableProps;
const mockSettings = new Map();
const mockNotes = [{id:'n1',title:'ملاحظة أصلية',body:'محتوى محفوظ',createdAt:1,updatedAt:1}];
let mockData;
let mockDatabase;
let mockTransactions;
let mockFileText;
jest.mock('../src/StudyHome', () => {
  const React = require('react');
  const {StudyHome} = jest.requireActual('../src/StudyHome');
  return {StudyHome: props => { mockStudyHomeProps = props; return React.createElement(StudyHome, props); }};
});
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
jest.mock('expo-file-system', () => ({Paths:{cache:'/cache'},File: class {size=30;uri='/cache/file';text=async()=>await mockFileText;create(){};write=async()=>{};}}));
jest.mock('expo-sharing', () => ({isAvailableAsync:jest.fn(async()=>true),shareAsync:jest.fn(async()=>{})}));
jest.mock('expo-document-picker', () => ({getDocumentAsync:jest.fn()}));

const point = {id:7,schemaVersion:1,createdAt:1,reason:'before-import',noteCount:1,cardCount:0,reviewCount:0,bytes:200};
const backup = {format:'rusukh-backup',version:1,exportedAt:'2026-11-02T00:00:00.000Z',notes:[],cards:[],reviews:[]};

beforeEach(() => {
  jest.useFakeTimers();
  mockFileText = ''; DocumentPicker.getDocumentAsync.mockReset();
  mockSettings.clear(); mockSettings.set(WORKSPACE_KEY, JSON.stringify(workspacePreset('simple'))); mockRecoveryProps = undefined; mockPortableProps = undefined;
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
  await render(<App />); await screen.findAllByText('مساحتي');
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

test('confirmed SQL recovery failure without a draft reports failure and never clears a draft slot', async () => {
  await openSettings();
  storage.restoreRecoveryPoint.mockRejectedValueOnce(new Error('SQLITE_FULL'));
  let result;
  await act(async () => {
    const pending = mockRecoveryProps.onRestore(point); chooseRestore('استعادة'); result = await pending;
  });
  expect(result).toBe(false); expect(storage.restoreRecoveryPoint).toHaveBeenCalledWith(mockDatabase,7);
  expect(draftWasCleared()).toBe(false);
  expect(Alert.alert).toHaveBeenCalledWith('تعذّر إكمال العملية',expect.stringContaining('SQLITE_FULL'));
});

test('successful recovery without a draft waits for SQL and never writes a draft tombstone', async () => {
  await openSettings();
  let release;
  storage.restoreRecoveryPoint.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
  let pending;
  await act(async () => { pending = mockRecoveryProps.onRestore(point); chooseRestore('استعادة'); });
  expect(draftWasCleared()).toBe(false);
  let result;
  await act(async () => { release(); result = await pending; });
  expect(result).toBe(true); expect(mockSettings.has(NOTE_DRAFT_KEY)).toBe(false);
  await act(async () => { jest.advanceTimersByTime(1500); });
  expect(draftWasCleared()).toBe(false);
});

test('portable SQL failure without a draft reports failure without clearing a draft', async () => {
  await openSettings();
  storage.restoreBackup.mockRejectedValueOnce(new Error('SQLITE_BUSY'));
  let result; await act(async () => { result = await mockPortableProps.restoreStudy(backup); });
  expect(result).toBe(false); expect(storage.restoreBackup).toHaveBeenCalledWith(mockDatabase,backup);
  expect(draftWasCleared()).toBe(false);
});

test('portable restore blocks a live unpublished editor before SQL', async () => {
  await openSettings(); await editAndAutosave();
  let result; await act(async () => { result = await mockPortableProps.restoreStudy(backup); });
  expect(result).toBe(false); expect(storage.restoreBackup).not.toHaveBeenCalled();
  expect(JSON.parse(mockSettings.get(NOTE_DRAFT_KEY)).body).toBe('مسودة عربية يجب ألا تضيع');
  expect(screen.getByLabelText('المحتوى').props.value).toBe('مسودة عربية يجب ألا تضيع');
  expect(draftWasCleared()).toBe(false);
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

test('pending JSON import stops if another committed operation fails to refresh', async () => {
  await openSettings();
  let releaseRead;
  mockFileText = new Promise(resolve => { releaseRead = resolve; });
  DocumentPicker.getDocumentAsync.mockResolvedValueOnce({canceled:false,assets:[{uri:'file:///backup.json',size:50}]});
  await fireEvent.press(screen.getByRole('button',{name:'استيراد نسخة من الملفات'}));
  storage.readAll.mockRejectedValueOnce(new Error('SQLITE_IOERR'));
  await act(async () => {
    const pending = mockRecoveryProps.onRestore(point);
    chooseRestore('استعادة');
    await pending;
  });
  expect(screen.getByText('حُفظ التغيير؛ تعذّر تحديث العرض')).toBeTruthy();
  await act(async () => { releaseRead(JSON.stringify(backup)); await mockFileText; });
  expect(Alert.alert.mock.calls.some(call => call[0] === 'استبدال البيانات الحالية؟')).toBe(false);
  expect(storage.restoreBackup).not.toHaveBeenCalled();
});

test('restore callback from an earlier render respects the live failed-refresh barrier', async () => {
  await openSettings();
  const delayedRestore = mockPortableProps.restoreStudy;
  const retainedDraft = JSON.stringify({version:1,editingId:'n1',title:'مسودة',body:'تعديل محفوظ',updatedAt:1});
  storage.readAll.mockRejectedValueOnce(new Error('SQLITE_IOERR'));
  let result;
  await act(async () => {
    await mockPortableProps.applyPreferences({isDark:true,workspace:defaultWorkspace()});
    // Invoking before a React render also checks the synchronous write barrier.
    mockSettings.set(NOTE_DRAFT_KEY,retainedDraft);
    storage.setSetting.mockClear();
    result = await delayedRestore(backup);
  });
  expect(result).toBe(false);
  expect(storage.restoreBackup).not.toHaveBeenCalled();
  expect(draftWasCleared()).toBe(false);
  expect(mockSettings.get(NOTE_DRAFT_KEY)).toBe(retainedDraft);
  expect(screen.getByText('حُفظ التغيير؛ تعذّر تحديث العرض')).toBeTruthy();
});


const retainedDraft = {version:1,editingId:'n1',title:'مسودة لم تنشر',body:'نص لا يوجد في النسخة المستوردة',updatedAt:1};
function importAlert() {
  const call = [...Alert.alert.mock.calls].reverse().find(item => item[0] === 'استبدال البيانات الحالية؟');
  expect(call).toBeTruthy(); return call;
}
async function confirmImport() {
  mockFileText = JSON.stringify(backup);
  DocumentPicker.getDocumentAsync.mockResolvedValueOnce({canceled:false,assets:[{uri:'file:///backup.json',size:30}]});
  await fireEvent.press(screen.getByRole('button',{name:'استيراد نسخة من الملفات'}));
  await act(async () => { importAlert()[2].find(item => item.text === 'استبدال').onPress(); });
}
async function performRestore(path) {
  if (path === 'json') { await confirmImport(); return; }
  let result;
  await act(async () => {
    if (path === 'folder') result = await mockPortableProps.restoreStudy(backup);
    else { const pending = mockRecoveryProps.onRestore(point); chooseRestore('استعادة'); result = await pending; }
  });
  return result;
}

test.each(['json','folder','point'])('%s restore preserves a retained draft with its editor closed and does not run SQL',async(path)=>{
  const previous=JSON.stringify(retainedDraft); mockSettings.set(NOTE_DRAFT_KEY,previous);
  await openSettings();
  await performRestore(path);
  expect(storage.restoreBackup).not.toHaveBeenCalled(); expect(storage.restoreRecoveryPoint).not.toHaveBeenCalled();
  expect(mockSettings.get(NOTE_DRAFT_KEY)).toBe(previous); expect(draftWasCleared()).toBe(false);
  expect(Alert.alert.mock.calls.some(call=>String(call[1]).includes('مسودة'))).toBe(true);
});

test.each(['json','folder','point'])('%s restore can replace study when the live state and database have no draft',async(path)=>{
  mockSettings.set(NOTE_DRAFT_KEY,'null'); await openSettings(); storage.getSetting.mockClear();
  await performRestore(path);
  expect(path==='point'?storage.restoreRecoveryPoint:storage.restoreBackup).toHaveBeenCalledTimes(1);
  expect(storage.getSetting).toHaveBeenCalledWith(mockDatabase,NOTE_DRAFT_KEY);
  expect(mockSettings.get(NOTE_DRAFT_KEY)).toBe('null'); expect(draftWasCleared()).toBe(false);
});

test('JSON selection started before a new draft cannot discard the newer editor or autosave',async()=>{
  await openSettings();
  let resolvePicker;
  DocumentPicker.getDocumentAsync.mockImplementationOnce(()=>new Promise(resolve=>{resolvePicker=resolve;}));
  mockFileText=JSON.stringify(backup);
  await fireEvent.press(screen.getByRole('button',{name:'استيراد نسخة من الملفات'}));
  await editAndAutosave(); const previous=mockSettings.get(NOTE_DRAFT_KEY);
  await act(async()=>{resolvePicker({canceled:false,assets:[{uri:'file:///backup.json',size:30}]});});
  await act(async()=>{importAlert()[2].find(item=>item.text==='استبدال').onPress();});
  expect(storage.restoreBackup).not.toHaveBeenCalled();
  expect(mockSettings.get(NOTE_DRAFT_KEY)).toBe(previous); expect(draftWasCleared()).toBe(false);
  expect(screen.getByLabelText('المحتوى').props.value).toBe('مسودة عربية يجب ألا تضيع');
});

test('a stale recovery confirmation reads the newly retained database draft at commit time',async()=>{
  await openSettings(); let pending;
  await act(async()=>{pending=mockRecoveryProps.onRestore(point);});
  const previous=JSON.stringify(retainedDraft); mockSettings.set(NOTE_DRAFT_KEY,previous);
  let result; await act(async()=>{chooseRestore('استعادة');result=await pending;});
  expect(result).toBe(false); expect(storage.restoreRecoveryPoint).not.toHaveBeenCalled();
  expect(mockSettings.get(NOTE_DRAFT_KEY)).toBe(previous); expect(draftWasCleared()).toBe(false);
});

test('a portable callback captured before a draft was written reads the current database slot',async()=>{
  await openSettings(); const restore=mockPortableProps.restoreStudy;
  const previous=JSON.stringify(retainedDraft);mockSettings.set(NOTE_DRAFT_KEY,previous);
  let result;await act(async()=>{result=await restore(backup);});
  expect(result).toBe(false);expect(storage.restoreBackup).not.toHaveBeenCalled();
  expect(mockSettings.get(NOTE_DRAFT_KEY)).toBe(previous);expect(draftWasCleared()).toBe(false);
});

test('restore blocks an open card editor even when no note draft is retained',async()=>{
  await openSettings(); const restore=mockPortableProps.restoreStudy;
  await fireEvent.press(screen.getByRole('tab',{name:'الرئيسية'}));
  await fireEvent.press(screen.getByRole('button',{name:'فتح ملاحظة أصلية'}));
  await fireEvent.press(screen.getByRole('button',{name:'بطاقة يدوية للملاحظة'}));
  await fireEvent.changeText(screen.getByLabelText('السؤال'),'سؤال غير محفوظ');
  storage.setSetting.mockClear();
  let result;await act(async()=>{result=await restore(backup);});
  expect(result).toBe(false);expect(storage.restoreBackup).not.toHaveBeenCalled();
  expect(screen.getByLabelText('السؤال').props.value).toBe('سؤال غير محفوظ');expect(draftWasCleared()).toBe(false);
});

test('a database draft read failure at replacement time fails closed',async()=>{
  await openSettings();
  storage.getSetting.mockRejectedValueOnce(new Error('SQLITE_IOERR'));
  let result;await act(async()=>{result=await mockPortableProps.restoreStudy(backup);});
  expect(result).toBe(false);expect(storage.restoreBackup).not.toHaveBeenCalled();expect(draftWasCleared()).toBe(false);
  expect(Alert.alert).toHaveBeenCalledWith('تعذّر إكمال العملية',expect.stringContaining('المسودة'));
});

test('restore does not run while initial draft recovery is still loading',async()=>{
  let resolveRead;
  const reading=new Promise(resolve=>{resolveRead=resolve;});
  storage.getSetting.mockImplementation(async(db,key)=>key===NOTE_DRAFT_KEY?reading:(db.settings??mockSettings).get(key)??null);
  await openSettings(); let result;
  await act(async()=>{result=await mockPortableProps.restoreStudy(backup);});
  expect(result).toBe(false);expect(storage.restoreBackup).not.toHaveBeenCalled();expect(draftWasCleared()).toBe(false);
  await act(async()=>{resolveRead(null);});
});

test('a failed initial draft read prevents replacement even if a later database read could return null',async()=>{
  storage.getSetting.mockImplementation(async(db,key)=>{if(key===NOTE_DRAFT_KEY)throw new Error('draft unreadable');return (db.settings??mockSettings).get(key)??null;});
  await openSettings();
  storage.getSetting.mockImplementation(async(db,key)=>(db.settings??mockSettings).get(key)??null);
  let result;await act(async()=>{result=await mockPortableProps.restoreStudy(backup);});
  expect(result).toBe(false);expect(storage.restoreBackup).not.toHaveBeenCalled();expect(draftWasCleared()).toBe(false);
});

test('opening an editor and invoking an old restore callback in the same turn still blocks SQL',async()=>{
  await openSettings();const restore=mockPortableProps.restoreStudy;
  await fireEvent.press(screen.getByRole('tab',{name:'الرئيسية'}));
  const openNote=mockStudyHomeProps.onOpenNote;
  let result;await act(async()=>{openNote(mockNotes[0]);result=await restore(backup);});
  expect(result).toBe(false);expect(storage.restoreBackup).not.toHaveBeenCalled();
  expect(screen.getByLabelText('المحتوى').props.value).toBe('محتوى محفوظ');
});

test('a replacement waiting for its database draft check prevents a new editor from opening',async()=>{
  await openSettings();const restore=mockPortableProps.restoreStudy;
  await fireEvent.press(screen.getByRole('tab',{name:'الرئيسية'}));
  let releaseRead;
  storage.getSetting.mockImplementationOnce(()=>new Promise(resolve=>{releaseRead=resolve;}));
  let pending;await act(async()=>{pending=restore(backup);});
  await fireEvent.press(screen.getByRole('button',{name:'فتح ملاحظة أصلية'}));
  expect(screen.queryByLabelText('المحتوى')).toBeNull();
  let result;await act(async()=>{releaseRead(null);result=await pending;});
  expect(result).toBe(true);expect(storage.restoreBackup).toHaveBeenCalledTimes(1);expect(draftWasCleared()).toBe(false);
});

test('a corrupt draft slot appearing after recovery was loaded is protected rather than normalized away',async()=>{
  await openSettings();const raw='{"version":1,"body":"unfinished';mockSettings.set(NOTE_DRAFT_KEY,raw);
  let result;await act(async()=>{result=await mockPortableProps.restoreStudy(backup);});
  expect(result).toBe(false);expect(storage.restoreBackup).not.toHaveBeenCalled();
  expect(mockSettings.get(NOTE_DRAFT_KEY)).toBe(raw);expect(draftWasCleared()).toBe(false);
});
