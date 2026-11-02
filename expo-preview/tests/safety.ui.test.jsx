import React from 'react';
import { Alert, AppState } from 'react-native';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react-native';
import App from '../App';
import { WORKSPACE_KEY, workspacePreset } from '../src/workspace';
import * as storage from '../src/storage';
import * as picker from 'expo-document-picker';

const mockSettings = new Map();
const mockNotes = [{id:'n1',title:'التعلُّم النشط',body:'ملاحظة محفوظة',createdAt:1,updatedAt:1}];
const mockCards = [{id:'c1',noteId:'n1',question:'سؤال',answer:'جواب',dueAt:0,intervalDays:0,ease:2.5,repetitions:0,updatedAt:1}];
let mockText = 'س: ماذا نتعلم؟\nج: العلم';
jest.mock('../src/storage', () => ({
  openStorage: jest.fn(async () => ({})),
  readAll: jest.fn(async () => ({notes:mockNotes,cards:mockCards,reviews:[]})),
  getSetting: jest.fn(async (_,key) => mockSettings.get(key) ?? null),
  setSetting: jest.fn(async (_,key,value) => {mockSettings.set(key,value);}),
  saveNoteAndCards: jest.fn(async () => {}), saveNote: jest.fn(async () => {}), saveCard: jest.fn(async () => {}),
  deleteNote: jest.fn(), deleteCard: jest.fn(), restoreBackup: jest.fn(), makeBackup: jest.fn(), recordReview: jest.fn(),
}));
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('expo-symbols', () => ({SymbolView: () => null}));
jest.mock('expo-file-system', () => ({Paths:{cache:'/cache'},File: class {size=30;uri='/cache/file';text=async()=>mockText;create(){};write=async()=>{};}}));
jest.mock('expo-sharing', () => ({isAvailableAsync:jest.fn(async()=>true),shareAsync:jest.fn(async()=>{})}));
jest.mock('expo-document-picker', () => ({getDocumentAsync:jest.fn()}));

async function openApp() { await render(<App />); await screen.findByText('مساحتي'); }
async function customize() { await fireEvent.press(screen.getByRole('button',{name:'تخصيص مساحتي'})); }
async function hideDefault() {
  await fireEvent(screen.getByLabelText('إظهار مراجعة اليوم'),'valueChange',false);
  await fireEvent(screen.getByLabelText('إظهار ملاحظاتي'),'valueChange',false);
}
beforeEach(()=>{
  mockSettings.clear(); mockCards[0].dueAt=0;
  mockSettings.set(WORKSPACE_KEY, JSON.stringify(workspacePreset('simple')));
  storage.readAll.mockImplementation(async () => ({notes:mockNotes,cards:mockCards,reviews:[]}));
  storage.setSetting.mockImplementation(async (_,key,value)=>{mockSettings.set(key,value);});
  jest.spyOn(Alert,'alert').mockImplementation(()=>{});
});
afterEach(()=>{ jest.restoreAllMocks(); });


test('database startup failure offers retry and recovers', async()=>{
  storage.openStorage.mockRejectedValueOnce(new Error('temporary disk failure'));
  await render(<App />);
  await screen.findByText('تعذّر تشغيل رُسوخ');
  await fireEvent.press(screen.getByRole('button',{name:'إعادة المحاولة'}));
  await screen.findByText('مساحتي');
});

test('successful write followed by failed refresh does not allow duplicate save', async()=>{
  await openApp();
  await fireEvent.press(screen.getByRole('button',{name:'ملاحظة جديدة'}));
  await fireEvent.changeText(screen.getByLabelText('العنوان'),'ملاحظة محفوظة مرة');
  storage.readAll.mockRejectedValueOnce(new Error('read failed after committed write'));
  await fireEvent.press(screen.getByRole('button',{name:'حفظ الملاحظة'}));
  await screen.findByText('حُفظ التغيير؛ تعذّر تحديث العرض');
  expect(storage.saveNoteAndCards).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole('button',{name:'حفظ الملاحظة'})).toBeNull();
  await fireEvent.press(screen.getByRole('button',{name:'إعادة تحميل البيانات'}));
  await screen.findByText('مساحتي');
  expect(storage.saveNoteAndCards).toHaveBeenCalledTimes(1);
});

test('review answer stays hidden before reveal instead of leaking in card list', async()=>{
  await openApp(); await fireEvent.press(screen.getByRole('button',{name:'ابدأ المراجعة'}));
  expect(screen.queryByText('جواب')).toBeNull();
  await fireEvent.press(screen.getByRole('button',{name:'إظهار الإجابة'}));
  expect(screen.getByText('جواب')).toBeTruthy();
});

test('note title cannot reveal the answer before the student requests it', async()=>{
  storage.readAll.mockResolvedValueOnce({notes:[{...mockNotes[0],title:'عنوان يكشف الجواب'}],cards:mockCards,reviews:[]});
  await openApp(); await fireEvent.press(screen.getByRole('tab',{name:'المراجعة'}));
  expect(screen.queryByText('عنوان يكشف الجواب')).toBeNull();
  await fireEvent.press(screen.getByRole('button',{name:'إظهار الإجابة'}));
  expect(screen.getByText('عنوان يكشف الجواب')).toBeTruthy();
});

test('closing a changed note asks before discarding', async()=>{
  await openApp(); await fireEvent.press(screen.getByRole('button',{name:'فتح التعلُّم النشط'}));
  await fireEvent.changeText(screen.getByLabelText('المحتوى'),'تعديل يجب ألا يضيع');
  await fireEvent.press(screen.getByRole('button',{name:'إغلاق'}));
  expect(Alert.alert).toHaveBeenCalledWith('لديك مسودة غير منشورة',expect.any(String),expect.any(Array));
  expect(screen.getByLabelText('المحتوى').props.value).toBe('تعديل يجب ألا يضيع');
});
