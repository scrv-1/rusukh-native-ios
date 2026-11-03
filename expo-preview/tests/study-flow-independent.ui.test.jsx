import React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import App from '../App';
import { CARD_DRAFT_KEY } from '../src/studyDrafts';
import { NOTE_DRAFT_KEY } from '../src/useNoteDraft';
import * as storage from '../src/storage';

const mockSettings = new Map();
const mockNotes=[{id:'n1',title:'مصدر البطاقة',body:'مادة محفوظة',createdAt:1,updatedAt:1}];
const mockCards=[{id:'c1',noteId:'n1',question:'سؤال محفوظ؟',answer:'جواب أصلي',dueAt:9999999999999,intervalDays:8,ease:2.5,repetitions:3,updatedAt:1}];
jest.mock('../src/storage',()=>({
 openStorage:jest.fn(async()=>({})),readAll:jest.fn(async()=>({notes:mockNotes,cards:mockCards,reviews:[]})),
 getSetting:jest.fn(async(_,key)=>mockSettings.get(key)??null),setSetting:jest.fn(async(_,key,value)=>{mockSettings.set(key,value);}),
 saveNoteAndCards:jest.fn(async()=>{}),saveNote:jest.fn(async()=>{}),saveCard:jest.fn(async()=>{}),updateCard:jest.fn(async()=>{}),
 deleteNote:jest.fn(),deleteCard:jest.fn(),restoreBackup:jest.fn(),makeBackup:jest.fn(),recordReview:jest.fn(),
}));
jest.mock('react-native-safe-area-context',()=>require('react-native-safe-area-context/jest/mock').default);
jest.mock('expo-symbols',()=>({SymbolView:()=>null}));
jest.mock('expo-file-system',()=>({Paths:{cache:'/cache'},File:class{size=1;uri='/cache/file';text=async()=>'';create(){};write=async()=>{};}}));
jest.mock('expo-sharing',()=>({isAvailableAsync:jest.fn(async()=>true),shareAsync:jest.fn(async()=>{})}));
jest.mock('expo-document-picker',()=>({getDocumentAsync:jest.fn()}));
beforeEach(()=>{jest.useFakeTimers();mockSettings.clear();storage.setSetting.mockImplementation(async(_,key,value)=>{mockSettings.set(key,value);});jest.spyOn(Alert,'alert').mockImplementation(()=>{});});
afterEach(()=>{jest.restoreAllMocks();jest.useRealTimers();});
async function cardEditor(){await render(<App/>);await screen.findByText('مساحتي');await fireEvent.press(screen.getByRole('tab',{name:'المراجعة'}));await fireEvent.press(screen.getByRole('button',{name:'إدارة البطاقات (1)'}));await fireEvent.press(screen.getByRole('button',{name:'تعديل سؤال محفوظ؟'}));}

test('reverting a card edit to the original answer does not recover an obsolete intermediate answer',async()=>{
 await cardEditor();
 await fireEvent.changeText(screen.getByLabelText('الإجابة'),'تعديل مؤقت تراجع عنه الطالب');
 await act(async()=>{jest.advanceTimersByTime(800);});
 expect(JSON.parse(mockSettings.get(CARD_DRAFT_KEY)).answer).toBe('تعديل مؤقت تراجع عنه الطالب');
 await fireEvent.changeText(screen.getByLabelText('الإجابة'),'جواب أصلي');
 await act(async()=>{jest.advanceTimersByTime(800);});
 const recovered=JSON.parse(mockSettings.get(CARD_DRAFT_KEY)??'null');
 expect(recovered===null||recovered.answer==='جواب أصلي').toBe(true);
 expect(storage.updateCard).not.toHaveBeenCalled();
});

test('save-draft-and-close preserves exact control-character text or keeps the editor open on failure',async()=>{
 await cardEditor();
 const current='جواب يحتوي محرفًا\u0000ثم بقية النص';
 await fireEvent.changeText(screen.getByLabelText('الإجابة'),current);
 await fireEvent.press(screen.getByRole('button',{name:'إغلاق'}));
 const alert=[...Alert.alert.mock.calls].reverse().find(call=>call[0]==='لديك مسودة بطاقة');
 expect(alert).toBeTruthy();
 await act(async()=>{await alert[2].find(button=>button.text==='حفظ مسودة وإغلاق').onPress();});
 const recovered=JSON.parse(mockSettings.get(CARD_DRAFT_KEY)??'null');
 const open=screen.queryByLabelText('الإجابة');
 // Either the exact text is persisted or the user can still edit/export it.
 expect(recovered?.answer===current||open?.props.value===current).toBe(true);
 if(!open){
  await screen.unmount();await render(<App/>);await screen.findByText('مساحتي');
  await fireEvent.press(await screen.findByRole('button',{name:'استعادة مسودة البطاقة'}));
  expect(screen.getByLabelText('الإجابة').props.value).toBe(current);
 }
});


const generatedNoteDraft=sourceNote=>({version:1,editingId:null,title:'أسئلة مولدة من المصدر',body:'س: ما الفكرة الجديدة؟\nج: هذه إجابة مستخرجة من مادة الدراسة.',updatedAt:10,sourceNote});
test('recovered AI note draft creates cards linked to its exact original source',async()=>{
 const source={id:'n1',createdAt:1,updatedAt:1};
 mockSettings.set(NOTE_DRAFT_KEY,JSON.stringify(generatedNoteDraft(source)));
 await render(<App/>);await screen.findByText('مساحتي');
 await fireEvent.press(await screen.findByRole('button',{name:'استعادة المسودة'}));
 await fireEvent.press(screen.getByRole('button',{name:'حفظ واستخراج بطاقات س/ج'}));
 await waitFor(()=>expect(storage.saveNoteAndCards).toHaveBeenCalled());
 const [,note,cards]=storage.saveNoteAndCards.mock.calls[0];
 expect(note.id).not.toBe('n1');expect(cards).toHaveLength(1);expect(cards[0].noteId).toBe('n1');
});

test.each([
 {id:'n1',createdAt:1,updatedAt:0},
 {id:'n1',createdAt:0,updatedAt:1},
 {id:'missing',createdAt:1,updatedAt:1},
])('recovered AI note draft does not attach cards to a changed, replaced or missing source: %j',async source=>{
 const saved=generatedNoteDraft(source);mockSettings.set(NOTE_DRAFT_KEY,JSON.stringify(saved));
 await render(<App/>);await screen.findByText('مساحتي');
 await fireEvent.press(await screen.findByRole('button',{name:'استعادة المسودة'}));
 await fireEvent.press(screen.getByRole('button',{name:'حفظ واستخراج بطاقات س/ج'}));
 expect(storage.saveNoteAndCards).not.toHaveBeenCalled();expect(Alert.alert).toHaveBeenCalledWith('تغير المصدر الأصلي',expect.any(String));
 expect(screen.getByLabelText('المحتوى').props.value).toBe(saved.body);
 await fireEvent.press(screen.getByRole('button',{name:'حفظ الملاحظة'}));
 await waitFor(()=>expect(storage.saveNoteAndCards).toHaveBeenCalled());
 expect(storage.saveNoteAndCards.mock.calls[0][2]).toEqual([]);
});

test('reverting a note edit to its original text does not recover an obsolete intermediate body',async()=>{
 await render(<App/>);await screen.findByText('مساحتي');
 await fireEvent.press(screen.getByRole('tab',{name:'الملاحظات'}));
 await fireEvent.press(screen.getByRole('button',{name:'فتح مصدر البطاقة'}));
 await fireEvent.changeText(screen.getByLabelText('المحتوى'),'تعديل مؤقت للملاحظة ألغاه الطالب');
 await act(async()=>{jest.advanceTimersByTime(900);});
 expect(JSON.parse(mockSettings.get(NOTE_DRAFT_KEY)).body).toBe('تعديل مؤقت للملاحظة ألغاه الطالب');
 await fireEvent.changeText(screen.getByLabelText('المحتوى'),'مادة محفوظة');
 await act(async()=>{jest.advanceTimersByTime(900);});
 const recovered=JSON.parse(mockSettings.get(NOTE_DRAFT_KEY)??'null');
 expect(recovered===null||recovered.body==='مادة محفوظة').toBe(true);
 expect(storage.saveNoteAndCards).not.toHaveBeenCalled();
});


test('reverting a note while its first autosave is pending leaves no stale recovery text',async()=>{
 let release;const gate=new Promise(resolve=>{release=resolve;});
 storage.setSetting.mockImplementation(async(_,key,value)=>{
  if(key===NOTE_DRAFT_KEY&&JSON.parse(value)?.body==='تعديل قيد الحفظ تراجع عنه الطالب')await gate;
  mockSettings.set(key,value);
 });
 await render(<App/>);await screen.findByText('مساحتي');
 await fireEvent.press(screen.getByRole('tab',{name:'الملاحظات'}));
 await fireEvent.press(screen.getByRole('button',{name:'فتح مصدر البطاقة'}));
 await fireEvent.changeText(screen.getByLabelText('المحتوى'),'تعديل قيد الحفظ تراجع عنه الطالب');
 await act(async()=>{jest.advanceTimersByTime(900);});
 await fireEvent.changeText(screen.getByLabelText('المحتوى'),'مادة محفوظة');
 await act(async()=>{jest.advanceTimersByTime(900);release();await Promise.resolve();await Promise.resolve();});
 await waitFor(()=>{const value=JSON.parse(mockSettings.get(NOTE_DRAFT_KEY)??'null');expect(value===null||value.body==='مادة محفوظة').toBe(true);});
});
