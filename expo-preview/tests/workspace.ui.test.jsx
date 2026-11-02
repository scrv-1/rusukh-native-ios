import React from 'react';
import { Alert, AppState } from 'react-native';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react-native';
import App from '../App';
import { WORKSPACE_KEY, defaultWorkspace, workspacePreset } from '../src/workspace';
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
  mockText = 'س: ماذا نتعلم؟\nج: العلم';
  storage.readAll.mockImplementation(async () => ({notes:mockNotes,cards:mockCards,reviews:[]}));
  storage.setSetting.mockImplementation(async (_,key,value)=>{mockSettings.set(key,value);});
  jest.spyOn(Alert,'alert').mockImplementation(()=>{});
});
afterEach(()=>{ jest.restoreAllMocks(); });

test('hide every tool, save, remount and reopen preserved notes through all tools', async()=>{
  await openApp(); await customize(); await hideDefault();
  await fireEvent.press(screen.getByRole('button',{name:'حفظ مساحتي'}));
  await screen.findByRole('button',{name:'إضافة أداة'});
  expect(storage.deleteNote).not.toHaveBeenCalled(); expect(storage.restoreBackup).not.toHaveBeenCalled();
  await screen.unmount(); await openApp();
  expect(screen.getByRole('button',{name:'إضافة أداة'})).toBeTruthy();
  await fireEvent.press(screen.getAllByRole('button',{name:'كل الأدوات'})[0]);
  await fireEvent.press(screen.getByRole('button',{name:'فتح ملاحظاتي'}));
  expect(screen.getByRole('button',{name:'فتح التعلُّم النشط'})).toBeTruthy();
  await fireEvent.changeText(screen.getByLabelText('البحث في الملاحظات'),'التعلم');
  expect(screen.getByRole('button',{name:'فتح التعلُّم النشط'})).toBeTruthy();
});

test('cancel discards draft; reset defaults takes effect only after save', async()=>{
  await openApp(); await customize(); await hideDefault();
  await fireEvent.press(screen.getByRole('button',{name:'إلغاء التخصيص'}));
  expect(screen.getByRole('button',{name:'ابدأ المراجعة'})).toBeTruthy();
  expect(storage.setSetting).not.toHaveBeenCalled();
  await customize(); await hideDefault();
  await fireEvent.press(screen.getByRole('button',{name:'استعادة الترتيب الافتراضي'}));
  await fireEvent.press(screen.getByRole('button',{name:'حفظ مساحتي'}));
  await waitFor(()=>expect(JSON.parse(mockSettings.get(WORKSPACE_KEY))).toEqual(defaultWorkspace()));
});

test('failed save keeps draft available for retry and does not apply layout', async()=>{
  await openApp(); await customize(); await hideDefault();
  storage.setSetting.mockRejectedValueOnce(new Error('disk full'));
  await fireEvent.press(screen.getByRole('button',{name:'حفظ مساحتي'}));
  await waitFor(()=>expect(Alert.alert).toHaveBeenCalledWith('لم يُحفظ الترتيب',expect.any(String)));
  expect(screen.getByRole('button',{name:'حفظ مساحتي'})).toBeEnabled();
  expect(JSON.parse(mockSettings.get(WORKSPACE_KEY))).toEqual(workspacePreset('simple'));
  await fireEvent.press(screen.getByRole('button',{name:'حفظ مساحتي'}));
  await screen.findByRole('button',{name:'إضافة أداة'});
});

test('reorder and compact preference survive restart', async()=>{
  await openApp(); await customize();
  await fireEvent.press(screen.getByRole('button',{name:'تقديم ملاحظاتي'}));
  await fireEvent.press(screen.getByRole('button',{name:'مختصر'}));
  await fireEvent.press(screen.getByRole('button',{name:'حفظ مساحتي'}));
  await waitFor(()=>expect(mockSettings.has(WORKSPACE_KEY)).toBe(true));
  await screen.unmount(); await openApp();
  const tabs=screen.getAllByRole('tab').map(t=>t.props.accessibilityLabel);
  expect(tabs).toEqual(['الرئيسية','الملاحظات','المراجعة','الأدوات','الإعدادات']);
  expect(screen.queryByRole('button',{name:'فتح التعلُّم النشط'})).toBeNull();
});

test('all-tools preset is a reversible draft and hiding every panel keeps fixed navigation', async()=>{
  await openApp(); await customize();
  await fireEvent.press(screen.getByRole('button',{name:'كل الأقسام'}));
  expect(screen.getAllByRole('switch').every(s=>s.props.value)).toBe(true);
  expect(storage.setSetting).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole('button',{name:'إلغاء التخصيص'}));
  await customize();
  await fireEvent.press(screen.getByRole('button',{name:'إخفاء كل الأقسام'}));
  await fireEvent.press(screen.getByRole('button',{name:'حفظ مساحتي'}));
  await screen.findByRole('button',{name:'إضافة أداة'});
  expect(screen.getAllByRole('tab').map(t=>t.props.accessibilityLabel)).toEqual(['الرئيسية','الملاحظات','المراجعة','الأدوات','الإعدادات']);
  await fireEvent.press(screen.getByRole('tab',{name:'الملاحظات'}));
  expect(screen.getByRole('button',{name:'فتح التعلُّم النشط'})).toBeTruthy();
  expect(storage.deleteNote).not.toHaveBeenCalled();
});

test('tools search retains hidden modules and provides a clear no-result recovery', async()=>{
  await openApp(); await fireEvent.press(screen.getByRole('tab',{name:'الأدوات'}));
  await fireEvent.changeText(screen.getByLabelText('البحث في الأدوات'),'PDF');
  expect(screen.getByRole('button',{name:'فتح مصادري'})).toBeTruthy();
  expect(screen.queryByRole('button',{name:'فتح مراجعة اليوم'})).toBeNull();
  await fireEvent.changeText(screen.getByLabelText('البحث في الأدوات'),'غيرموجود');
  await fireEvent.press(screen.getByRole('button',{name:'مسح بحث الأدوات'}));
  expect(screen.getByRole('button',{name:'فتح مساعد الدراسة المحلي'})).toBeTruthy();
});

test('first-run review tab offers a direct path to create study material', async()=>{
  mockSettings.delete(WORKSPACE_KEY);
  storage.readAll.mockResolvedValueOnce({notes:[],cards:[],reviews:[]});
  await openApp(); await fireEvent.press(screen.getByRole('tab',{name:'المراجعة'}));
  await fireEvent.press(screen.getByRole('button',{name:'إنشاء بطاقات من الملاحظات'}));
  expect(screen.getByRole('button',{name:'إضافة أول ملاحظة'})).toBeTruthy();
  expect(storage.recordReview).not.toHaveBeenCalled();
});

test('no saved layout leaves the home canvas blank and capture available before customization', async()=>{
  mockSettings.clear();
  storage.readAll.mockResolvedValueOnce({notes:[],cards:[],reviews:[]});
  await openApp();
  expect(screen.getAllByText('مساحتي')).toHaveLength(1);
  expect(screen.queryByText('مراجعة اليوم')).toBeNull();
  expect(screen.queryByText('ملاحظاتي')).toBeNull();
  expect(screen.queryByText('ابدأ بما يناسب وقتك')).toBeNull();
  expect(screen.queryByText('مساحة هادئة على ذوقك')).toBeNull();
  expect(screen.getByRole('button',{name:'إضافة مادة'})).toBeTruthy();
  expect(screen.getByRole('button',{name:'إضافة أداة'})).toBeTruthy();
  await fireEvent.press(screen.getByRole('button',{name:'ملاحظة جديدة'}));
  expect(screen.getByLabelText('المحتوى')).toBeTruthy();
  expect(mockSettings.has(WORKSPACE_KEY)).toBe(false);
  expect(storage.saveNoteAndCards).not.toHaveBeenCalled();
});

test('add tool on a blank canvas can restore one hidden section without changing its data', async()=>{
  mockSettings.set(WORKSPACE_KEY, JSON.stringify(defaultWorkspace()));
  await openApp();
  await fireEvent.press(screen.getByRole('button',{name:'إضافة أداة'}));
  expect(screen.getAllByRole('switch').every(control=>control.props.value === false)).toBe(true);
  await fireEvent(screen.getByLabelText('إظهار شبكة أفكاري'),'valueChange',true);
  await fireEvent.press(screen.getByRole('button',{name:'حفظ مساحتي'}));
  await screen.findByRole('button',{name:'فتح شبكة أفكاري'});
  expect(JSON.parse(mockSettings.get(WORKSPACE_KEY)).modules.filter(module=>module.enabled).map(module=>module.id)).toEqual(['graph']);
  expect(screen.queryByRole('button',{name:'ابدأ المراجعة'})).toBeNull();
  expect(storage.deleteNote).not.toHaveBeenCalled();
  expect(storage.saveNoteAndCards).not.toHaveBeenCalled();
});

test('late source file read never replaces a newer edited pasted draft', async()=>{
  let finishRead; mockText = new Promise(resolve => { finishRead = resolve; });
  picker.getDocumentAsync.mockResolvedValue({canceled:false,assets:[{uri:'/file',name:'قديم.txt',size:30}]});
  await openApp(); await fireEvent.press(screen.getByRole('button',{name:'إضافة مصدر'}));
  await fireEvent.press(screen.getByRole('button',{name:'اختيار مصدر من الملفات'}));
  await fireEvent.changeText(screen.getByLabelText('النص الذي تريد دراسته'),'النص الجديد');
  await fireEvent.press(screen.getByRole('button',{name:'مراجعة النص كمسودة'}));
  await fireEvent.changeText(screen.getByLabelText('المحتوى'),'تعديل مهم لم يُحفظ بعد');
  await act(async()=>{finishRead('محتوى الملف السابق');});
  expect(screen.getByLabelText('المحتوى').props.value).toBe('تعديل مهم لم يُحفظ بعد');
  expect(storage.saveNoteAndCards).not.toHaveBeenCalled();
});

test('leaving sources cancels a late picker result without opening an editor', async()=>{
  let finishPicker; picker.getDocumentAsync.mockReturnValueOnce(new Promise(resolve => {finishPicker=resolve;}));
  await openApp(); await fireEvent.press(screen.getByRole('button',{name:'إضافة مصدر'}));
  await fireEvent.press(screen.getByRole('button',{name:'اختيار مصدر من الملفات'}));
  await fireEvent.press(screen.getByRole('tab',{name:'الرئيسية'}));
  await act(async()=>{finishPicker({canceled:false,assets:[{uri:'/file',name:'متأخر.txt',size:30}]});});
  expect(screen.queryByLabelText('المحتوى')).toBeNull();
  expect(storage.saveNoteAndCards).not.toHaveBeenCalled();
});

test('density choices expose the current selection to assistive technology', async()=>{
  await openApp(); await customize();
  expect(screen.getByRole('button',{name:'مريح',selected:true})).toBeTruthy();
  expect(screen.getByRole('button',{name:'مختصر',selected:false})).toBeTruthy();
  await fireEvent.press(screen.getByRole('button',{name:'مختصر'}));
  expect(screen.getByRole('button',{name:'مختصر',selected:true})).toBeTruthy();
  expect(screen.getByRole('button',{name:'مريح',selected:false})).toBeTruthy();
  await fireEvent.press(screen.getByRole('button',{name:'حفظ مساحتي'}));
  await customize();
  expect(screen.getByRole('button',{name:'مختصر',selected:true})).toBeTruthy();
});

test('source import opens an editable draft and cancellation writes no content', async()=>{
  picker.getDocumentAsync.mockResolvedValue({canceled:false,assets:[{uri:'/file',name:'محاضرة.srt',size:30}]});
  await openApp(); await fireEvent.press(screen.getAllByRole('button',{name:'كل الأدوات'})[0]);
  await fireEvent.press(screen.getByRole('button',{name:'فتح مصادري'}));
  await fireEvent.press(screen.getByRole('button',{name:'اختيار مصدر من الملفات'}));
  const body=await screen.findByLabelText('المحتوى');
  expect(body.props.value).toContain('س: ماذا نتعلم؟');
  expect(storage.saveNoteAndCards).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole('button',{name:'إغلاق'}));
  expect(storage.saveNoteAndCards).not.toHaveBeenCalled();
});

test('returning to active app refreshes due counts without editing cards', async()=>{
  const now=Date.now(); mockCards[0].dueAt=now+60000;
  const listeners = new Set();
  jest.spyOn(AppState,'addEventListener').mockImplementation((event,fn)=>{listeners.add(fn);return {remove:()=>listeners.delete(fn)};});
  await openApp(); expect(screen.getByText('0 بطاقة مستحقة الآن')).toBeTruthy();
  jest.spyOn(Date,'now').mockReturnValue(now+60001);
  await act(async()=>{for (const listener of listeners) listener('active');});
  expect(screen.getByText('1 بطاقة مستحقة الآن')).toBeTruthy();
  expect(storage.recordReview).not.toHaveBeenCalled();
});
test('new cards become due immediately without waiting for the periodic clock', async()=>{
  const now=Date.now(); const time=jest.spyOn(Date,'now').mockReturnValue(now);
  await openApp(); time.mockReturnValue(now+1000);
  await fireEvent.press(screen.getByRole('button',{name:'ملاحظة جديدة'}));
  await fireEvent.changeText(screen.getByLabelText('العنوان'),'ملاحظة ثانية');
  await fireEvent.changeText(screen.getByLabelText('المحتوى'),'س: جديد؟\nج: نعم');
  storage.readAll.mockResolvedValueOnce({notes:mockNotes,cards:[...mockCards,{...mockCards[0],id:'new',dueAt:now+1000}],reviews:[]});
  await fireEvent.press(screen.getByRole('button',{name:'حفظ واستخراج بطاقات س/ج'}));
  await screen.findByText('2 بطاقة مستحقة الآن');
  expect(storage.saveNoteAndCards).toHaveBeenCalledTimes(1);
  expect(storage.saveNoteAndCards.mock.calls[0][2]).toEqual([expect.objectContaining({question:'جديد؟',answer:'نعم',dueAt:now+1000})]);
});
