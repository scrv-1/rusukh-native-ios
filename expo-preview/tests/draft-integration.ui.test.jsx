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
const mockCards = [];
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

test('edit, keep draft, restart and resume preserves exact unpublished text', async () => {
  await openApp(); await openNote();
  await fireEvent.changeText(screen.getByLabelText('المحتوى'),'تعديل غير منشور\nس: سؤال؟');
  await fireEvent.press(screen.getByRole('button',{name:'إغلاق'}));
  await chooseAlert('لديك مسودة غير منشورة','حفظ مسودة وإغلاق');
  await waitFor(() => expect(screen.queryByLabelText('المحتوى')).toBeNull());
  expect(storage.saveNoteAndCards).not.toHaveBeenCalled();
  expect(JSON.parse(mockSettings.get(NOTE_DRAFT_KEY)).body).toBe('تعديل غير منشور\nس: سؤال؟');
  await screen.unmount(); await openApp();
  await fireEvent.press(await screen.findByRole('button',{name:'استعادة المسودة'}));
  expect(screen.getByLabelText('المحتوى').props.value).toBe('تعديل غير منشور\nس: سؤال؟');
  expect(screen.getByLabelText('العنوان').props.value).toBe(mockNotes[0].title);
});

test('dirty note blocks manual-card transition without losing content', async () => {
  await openApp(); await openNote();
  await fireEvent.changeText(screen.getByLabelText('المحتوى'),'نص يجب الاحتفاظ به');
  await fireEvent.press(screen.getByRole('button',{name:'بطاقة يدوية للملاحظة'}));
  expect(Alert.alert).toHaveBeenCalledWith('احفظ الملاحظة أولًا',expect.any(String));
  expect(screen.getByLabelText('المحتوى').props.value).toBe('نص يجب الاحتفاظ به');
  expect(screen.queryByLabelText('السؤال')).toBeNull();
});

test('failed close persistence keeps the editor open and preserves entered text', async () => {
  await openApp(); await openNote();
  await fireEvent.changeText(screen.getByLabelText('المحتوى'),'نص لم يتمكن القرص من حفظه');
  storage.setSetting.mockRejectedValueOnce(new Error('disk full'));
  await fireEvent.press(screen.getByRole('button',{name:'إغلاق'}));
  await chooseAlert('لديك مسودة غير منشورة','حفظ مسودة وإغلاق');
  await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith('تعذّر تحديث المسودة',expect.any(String)));
  expect(screen.getByLabelText('المحتوى').props.value).toBe('نص لم يتمكن القرص من حفظه');
  expect(screen.getByLabelText('المحتوى').props.editable).not.toBe(false);
});

test('pending autosave cannot resurrect draft after publishing and clearing', async () => {
  await openApp(); await openNote();
  let release;
  const blocked = new Promise(resolve => { release = resolve; });
  storage.setSetting.mockImplementationOnce(async (_,key,value) => { await blocked; mockSettings.set(key,value); });
  await fireEvent.changeText(screen.getByLabelText('المحتوى'),'النص المنشور');
  await act(async () => { jest.advanceTimersByTime(701); });
  expect(storage.setSetting).toHaveBeenCalledTimes(1);
  await fireEvent.press(screen.getByRole('button',{name:'حفظ الملاحظة'}));
  await waitFor(() => expect(storage.saveNoteAndCards).toHaveBeenCalledTimes(1));
  await act(async () => { release(); });
  await waitFor(() => expect(mockSettings.get(NOTE_DRAFT_KEY)).toBe('null'));
  await act(async () => { jest.advanceTimersByTime(1500); });
  expect(mockSettings.get(NOTE_DRAFT_KEY)).toBe('null');
  expect(screen.queryByRole('button',{name:'استعادة المسودة'})).toBeNull();
  await screen.unmount(); await openApp();
  expect(screen.queryByRole('button',{name:'استعادة المسودة'})).toBeNull();
});

test('reverting autosaved changes to the original clears stale recovery on close', async () => {
  await openApp(); await openNote();
  await fireEvent.changeText(screen.getByLabelText('المحتوى'),'تعديل تراجعت عنه');
  await act(async () => { jest.advanceTimersByTime(701); });
  await waitFor(() => expect(JSON.parse(mockSettings.get(NOTE_DRAFT_KEY)).body).toBe('تعديل تراجعت عنه'));
  await fireEvent.changeText(screen.getByLabelText('المحتوى'),mockNotes[0].body);
  await fireEvent.press(screen.getByRole('button',{name:'إغلاق'}));
  await waitFor(() => expect(screen.queryByLabelText('المحتوى')).toBeNull());
  expect(mockSettings.get(NOTE_DRAFT_KEY)).toBe('null');
  expect(screen.queryByRole('button',{name:'استعادة المسودة'})).toBeNull();
});

test('source import is treated as an unpublished draft even before further edits', async () => {
  picker.getDocumentAsync.mockResolvedValue({canceled:false,assets:[{uri:'/file',name:'محاضرة.txt',size:30}]});
  await openApp(); await fireEvent.press(screen.getAllByRole('button',{name:'كل الأدوات'})[0]);
  await fireEvent.press(screen.getByRole('button',{name:'فتح مصادري'}));
  await fireEvent.press(screen.getByRole('button',{name:'اختيار مصدر من الملفات'}));
  await screen.findByLabelText('المحتوى');
  await fireEvent.press(screen.getByRole('button',{name:'إغلاق'}));
  await chooseAlert('لديك مسودة غير منشورة','حفظ مسودة وإغلاق');
  await waitFor(() => expect(mockSettings.has(NOTE_DRAFT_KEY)).toBe(true));
  expect(JSON.parse(mockSettings.get(NOTE_DRAFT_KEY)).body).toBe('المصدر: محاضرة.txt\n\nنص المحاضرة المستورد');
  expect(storage.saveNoteAndCards).not.toHaveBeenCalled();
});

test('editor fields are locked while publishing to prevent late edits being discarded', async () => {
  await openApp(); await openNote();
  await fireEvent.changeText(screen.getByLabelText('المحتوى'),'نص محفوظ');
  let release;
  storage.saveNoteAndCards.mockImplementationOnce(() => new Promise(resolve => { release=resolve; }));
  await fireEvent.press(screen.getByRole('button',{name:'حفظ الملاحظة'}));
  expect(screen.getByLabelText('المحتوى').props.editable).toBe(false);
  expect(screen.getByLabelText('العنوان').props.editable).toBe(false);
  await act(async () => { release(); });
  await waitFor(() => expect(screen.queryByLabelText('المحتوى')).toBeNull());
});

test('saved label stops claiming durability when content changes before debounce', async () => {
  await openApp(); await openNote();
  await fireEvent.changeText(screen.getByLabelText('المحتوى'),'النسخة الأولى');
  await act(async () => { jest.advanceTimersByTime(701); });
  await screen.findByText('مسودة محفوظة على جهازك');
  await fireEvent.changeText(screen.getByLabelText('المحتوى'),'نسخة لم تحفظ بعد');
  expect(screen.queryByText('مسودة محفوظة على جهازك')).toBeNull();
});

test('editor fields are locked while saving a draft for close', async () => {
  await openApp(); await openNote();
  await fireEvent.changeText(screen.getByLabelText('المحتوى'),'مسودة للإغلاق');
  let release;
  storage.setSetting.mockImplementationOnce((_,key,value) => new Promise(resolve => {
    release = () => {mockSettings.set(key,value);resolve();};
  }));
  await fireEvent.press(screen.getByRole('button',{name:'إغلاق'}));
  await chooseAlert('لديك مسودة غير منشورة','حفظ مسودة وإغلاق');
  expect(screen.getByLabelText('المحتوى').props.editable).toBe(false);
  expect(screen.getByLabelText('العنوان').props.editable).toBe(false);
  await act(async () => { release(); });
  await waitFor(() => expect(screen.queryByLabelText('المحتوى')).toBeNull());
  expect(JSON.parse(mockSettings.get(NOTE_DRAFT_KEY)).body).toBe('مسودة للإغلاق');
});

test('opening manual-card editor after reverting a note clears the obsolete draft', async () => {
  await openApp(); await openNote();
  await fireEvent.changeText(screen.getByLabelText('المحتوى'),'تعديل قديم تم التراجع عنه');
  await act(async () => { jest.advanceTimersByTime(701); });
  await waitFor(() => expect(JSON.parse(mockSettings.get(NOTE_DRAFT_KEY)).body).toBe('تعديل قديم تم التراجع عنه'));
  await fireEvent.changeText(screen.getByLabelText('المحتوى'),mockNotes[0].body);
  await fireEvent.press(screen.getByRole('button',{name:'بطاقة يدوية للملاحظة'}));
  await screen.findByLabelText('السؤال');
  expect(mockSettings.get(NOTE_DRAFT_KEY)).toBe('null');
});
