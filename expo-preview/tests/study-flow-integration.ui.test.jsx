import React from 'react';
import { Alert } from 'react-native';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react-native';
import App from '../App';
import { NOTE_DRAFT_KEY } from '../src/useNoteDraft';
import { WORKSPACE_KEY, workspacePreset } from '../src/workspace';
import * as storage from '../src/storage';
import * as picker from 'expo-document-picker';

const mockSettings = new Map();
const mockNotes = [{id:'n1',title:'التعلُّم النشط',body:'ملاحظة محفوظة',createdAt:1,updatedAt:1}];
const mockCards = [{id:'c1',noteId:'n1',question:'سؤال قديم؟',answer:'جواب قديم',dueAt:9999999999999,intervalDays:8,ease:2.5,repetitions:3,updatedAt:1}];
jest.mock('../src/storage', () => ({
  openStorage: jest.fn(async () => ({})),
  readAll: jest.fn(async () => ({notes:mockNotes,cards:mockCards,reviews:[]})),
  getSetting: jest.fn(async (_,key) => mockSettings.get(key) ?? null),
  setSetting: jest.fn(async (_,key,value) => {mockSettings.set(key,value);}),
  saveNoteAndCards: jest.fn(async () => {}), saveNote: jest.fn(async () => {}), saveCard: jest.fn(async () => {}), updateCard: jest.fn(async () => {}),
  deleteNote: jest.fn(), deleteCard: jest.fn(), restoreBackup: jest.fn(), makeBackup: jest.fn(), recordReview: jest.fn(),
}));
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('expo-symbols', () => ({SymbolView: () => null}));
jest.mock('expo-file-system', () => ({Paths:{cache:'/cache'},File: class {size=30;uri='/cache/file';text=async()=>'نص المحاضرة المستورد';create(){};write=async()=>{};}}));
jest.mock('expo-sharing', () => ({isAvailableAsync:jest.fn(async()=>true),shareAsync:jest.fn(async()=>{})}));
jest.mock('expo-document-picker', () => ({getDocumentAsync:jest.fn()}));

async function openApp() { await render(<App />); await screen.findByText('مساحتي'); }
async function openNote() { await fireEvent.press(screen.getByRole('button',{name:'فتح التعلُّم النشط'})); }
async function chooseAlert(title, text) {
  const call = [...Alert.alert.mock.calls].reverse().find(call => call[0] === title);
  expect(call).toBeTruthy();
  const choice = call[2].find(button => button.text === text);
  expect(choice).toBeTruthy();
  await act(async () => { choice.onPress(); });
}
beforeEach(() => {
  jest.useFakeTimers();
  mockSettings.clear();
  mockSettings.set(WORKSPACE_KEY, JSON.stringify(workspacePreset('simple')));
  storage.readAll.mockImplementation(async () => ({notes:mockNotes,cards:mockCards,reviews:[]}));
  storage.getSetting.mockImplementation(async (_,key) => mockSettings.get(key) ?? null);
  storage.setSetting.mockImplementation(async (_,key,value) => {mockSettings.set(key,value);});
  storage.saveNoteAndCards.mockImplementation(async () => {});
  jest.spyOn(Alert,'alert').mockImplementation(()=>{});
});
afterEach(() => { jest.restoreAllMocks(); jest.useRealTimers(); });


async function sources(){await fireEvent.press(screen.getByRole('tab',{name:'الأدوات'}));await fireEvent.press(screen.getByRole('button',{name:'فتح مصادري'}));await screen.findByLabelText('النص الذي تريد دراسته');}
test('source intake survives navigation and app restart without creating study data',async()=>{
 await openApp(); await sources();
 await fireEvent.changeText(screen.getByLabelText('النص الذي تريد دراسته'),'مادة غير منشورة يجب أن تعود بعد التنقل وإعادة التشغيل.');
 await act(async()=>{jest.advanceTimersByTime(800);});
 await fireEvent.press(screen.getByRole('tab',{name:'الرئيسية'})); await sources();
 expect(screen.getByLabelText('النص الذي تريد دراسته').props.value).toBe('مادة غير منشورة يجب أن تعود بعد التنقل وإعادة التشغيل.');
 await screen.unmount(); await openApp(); await sources();
 expect(screen.getByLabelText('النص الذي تريد دراسته').props.value).toBe('مادة غير منشورة يجب أن تعود بعد التنقل وإعادة التشغيل.');
 expect(storage.saveNoteAndCards).not.toHaveBeenCalled();
});
test('new note can be captured with an automatic unique title',async()=>{
 await openApp();await fireEvent.press(screen.getByRole('button',{name:'ملاحظة جديدة'}));
 await fireEvent.changeText(screen.getByLabelText('المحتوى'),'فكرة مهمة عن التعلم\nشرح الفكرة.');
 await fireEvent.press(screen.getByRole('button',{name:'حفظ الملاحظة'}));
 await waitFor(()=>expect(storage.saveNoteAndCards).toHaveBeenCalled());
 expect(storage.saveNoteAndCards.mock.calls[0][1].title).toBe('فكرة مهمة عن التعلم');
});
test('card editing uses update preserving history instead of creating a new card',async()=>{
 await openApp();await fireEvent.press(screen.getByRole('tab',{name:'المراجعة'}));
 await fireEvent.press(screen.getByRole('button',{name:'إدارة البطاقات (1)'}));
 await fireEvent.press(screen.getByRole('button',{name:'تعديل سؤال قديم؟'}));
 await fireEvent.changeText(screen.getByLabelText('الإجابة'),'الجواب المصحح');
 await fireEvent.press(screen.getByRole('button',{name:'حفظ تعديل البطاقة'}));
 await waitFor(()=>expect(storage.updateCard).toHaveBeenCalledWith(expect.anything(),'c1',{question:'سؤال قديم؟',answer:'الجواب المصحح'}));
 expect(storage.saveCard).not.toHaveBeenCalled();
});

test('an empty library reaches source, saved card, recall summary and source return through the real App',async()=>{
 const study={notes:[],cards:[],reviews:[]};
 mockSettings.clear();storage.readAll.mockImplementation(async()=>({...study}));
 storage.saveNoteAndCards.mockImplementation(async(_,note,additions)=>{study.notes=[note];study.cards=additions;});
 await openApp();await fireEvent.press(screen.getByRole('button',{name:'إضافة مادة'}));
 await fireEvent.changeText(screen.getByLabelText('النص الذي تريد دراسته'),'الدرس الأول\nس: ما الخطوة؟\nج: استرجاع المعنى.');
 await fireEvent.press(screen.getByRole('button',{name:'مراجعة النص كمسودة'}));
 expect(screen.getByLabelText('العنوان').props.value).toBe('الدرس الأول');
 await fireEvent.press(screen.getByRole('button',{name:'حفظ واستخراج بطاقات س/ج'}));
 await fireEvent.press(await screen.findByRole('button',{name:'تدريب من هذه المادة'}));
 expect(study.notes).toHaveLength(1);expect(study.cards).toHaveLength(1);
 expect(screen.queryByText('استرجاع المعنى.')).toBeNull();
 await fireEvent.press(screen.getByRole('button',{name:'إظهار الإجابة'}));
 expect(screen.getByText('استرجاع المعنى.')).toBeTruthy();
 await fireEvent.press(screen.getByRole('button',{name:'تذكرت'}));
 await fireEvent.press(screen.getByRole('button',{name:'عرض الملخص'}));
 await fireEvent.press(screen.getByRole('button',{name:'فتح المصدر: الدرس الأول'}));
 await fireEvent.press(screen.getByRole('button',{name:'العودة إلى التدريب'}));
 expect(screen.getByRole('button',{name:'جلسة جديدة'})).toBeTruthy();
 expect(storage.recordReview).not.toHaveBeenCalled();
});
