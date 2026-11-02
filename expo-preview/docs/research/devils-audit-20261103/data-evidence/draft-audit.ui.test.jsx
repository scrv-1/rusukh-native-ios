import React from 'react';
import { Alert } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react-native';
import App from '../../../../App';
import { NOTE_DRAFT_KEY } from '../../../../src/useNoteDraft';
import { defaultWorkspace, readWorkspace, WORKSPACE_KEY } from '../../../../src/workspace';
import * as storage from '../../../../src/storage';

// The panels have their own interaction tests. Capture their public callbacks to
// exercise App's real action lock, confirmation, state and useNoteDraft lifecycle.
let mockRecoveryProps;
let mockPortableProps;
const mockSettings = new Map();
const mockNotes = [{id:'n1',title:'ملاحظة أصلية',body:'محتوى محفوظ',createdAt:1,updatedAt:1}];
let mockData;
let mockDatabase;
let mockTransactions;
let mockFileText;
jest.mock('../../../../src/backup/RecoveryPointsPanel', () => ({
  RecoveryPointsPanel: props => { mockRecoveryProps = props; return null; },
}));
jest.mock('../../../../src/backup/PortableBackupPanel', () => ({
  PortableBackupPanel: props => { mockPortableProps = props; return null; },
}));
jest.mock('../../../../src/reminders/RemindersPanel', () => ({RemindersPanel: () => null}));
jest.mock('../../../../src/storage', () => ({
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


test('D003 observed: confirmed import erases a retained unpublished draft without mentioning it', async()=>{
  const retained={version:1,editingId:null,title:'مسودة لم تُنشر',body:'فكرة لا توجد في أي ملاحظة محفوظة',updatedAt:1};
  mockSettings.set(NOTE_DRAFT_KEY,JSON.stringify(retained));
  await openSettings();
  mockFileText=JSON.stringify(backup);
  DocumentPicker.getDocumentAsync.mockResolvedValue({canceled:false,assets:[{uri:'/backup.json',name:'backup.json',size:30}]});
  await fireEvent.press(screen.getByRole('button',{name:'استيراد نسخة من الملفات'}));
  const call=[...Alert.alert.mock.calls].reverse().find(item=>item[0]==='استبدال البيانات الحالية؟');
  expect(call).toBeTruthy();expect(call[1]).not.toMatch(/مسود/);
  await act(async()=>{call[2].find(item=>item.text==='استبدال').onPress();});
  await waitFor(()=>expect(mockSettings.get(NOTE_DRAFT_KEY)).toBe('null'));
  console.log('D003 REPRODUCED',JSON.stringify({confirmation:call[1],draftBefore:retained.body,draftAfter:mockSettings.get(NOTE_DRAFT_KEY),studyBackupContainsDraft:Object.hasOwn(backup,'draft')}));
});
