import React from 'react';
import {Alert} from 'react-native';
import {render,screen,fireEvent,act} from '@testing-library/react-native';
import App from '../../../../App';
import {AIWorkspace} from '../../../../src/AIWorkspace';
import {light} from '../../../../src/ui';
import {graphEdges} from '../../../../src/core';
import * as storage from '../../../../src/storage';

const mockNotes = [{id:'n1',title:'درس قابل للتصحيح',body:'س: كم عدد الأقمار؟\nج: جواب قديم',createdAt:1,updatedAt:1}];
const mockCards = [{id:'c1',noteId:'n1',question:'كم عدد الأقمار؟',answer:'جواب قديم',dueAt:0,intervalDays:10,ease:2.5,repetitions:4,updatedAt:1}];
let mockResult;
jest.mock('../../../../src/storage',()=>({
 openStorage:jest.fn(async()=>({})),readAll:jest.fn(async()=>({notes:mockNotes,cards:mockCards,reviews:[]})),
 getSetting:jest.fn(async()=>null),setSetting:jest.fn(async()=>{}),
 saveNoteAndCards:jest.fn(async()=>{}),saveCard:jest.fn(async()=>{}),
 deleteNote:jest.fn(),deleteCard:jest.fn(),restoreBackup:jest.fn(),makeBackup:jest.fn(),recordReview:jest.fn(),
}));
jest.mock('../../../../src/ai/LocalAILab',()=>({LocalAILab:({onResult})=>{mockResult=onResult;return null;}}));
jest.mock('react-native-safe-area-context',()=>require('react-native-safe-area-context/jest/mock').default);
jest.mock('expo-symbols',()=>({SymbolView:()=>null}));
jest.mock('expo-file-system',()=>({Paths:{cache:'/cache'},File:class{size=30;uri='/cache/file';create(){};write=async()=>{};}}));
jest.mock('expo-sharing',()=>({isAvailableAsync:jest.fn(async()=>true),shareAsync:jest.fn(async()=>{})}));
jest.mock('expo-document-picker',()=>({getDocumentAsync:jest.fn()}));

beforeEach(()=>{jest.spyOn(Alert,'alert').mockImplementation(()=>{});});
afterEach(()=>{jest.restoreAllMocks();});

test('S001: correcting Q/A in the source note saves zero card updates; there is no card edit action',async()=>{
 await render(<App/>);await screen.findByText('مساحتي');
 await fireEvent.press(screen.getByRole('button',{name:'فتح درس قابل للتصحيح'}));
 await fireEvent.changeText(screen.getByLabelText('المحتوى'),'س: كم عدد الأقمار؟\nج: الجواب المصحح');
 await fireEvent.press(screen.getByRole('button',{name:'حفظ واستخراج بطاقات س/ج'}));
 expect(storage.saveNoteAndCards).toHaveBeenCalledWith(expect.anything(),expect.objectContaining({body:expect.stringContaining('الجواب المصحح')}),[]);
 expect(storage.saveCard).not.toHaveBeenCalled();
 expect(Alert.alert).toHaveBeenCalledWith('البطاقات','لم أجد أسئلة جديدة بصيغة س: وج:.');
 await fireEvent.press(screen.getByRole('tab',{name:'المراجعة'}));
 await fireEvent.press(screen.getByRole('button',{name:'إدارة البطاقات (1)'}));
 expect(screen.getByText('جواب قديم')).toBeTruthy();
 expect(screen.queryByRole('button',{name:/تعديل البطاقة|تحرير البطاقة/})).toBeNull();
});

test('S006: generated draft from an existing note loses a machine-readable link to the source',async()=>{
 const original={id:'original-id',title:'مصدر أصلي',body:'الكواكب تدور حول الشمس، والأقمار تدور حول الكواكب في مسارات مختلفة.',createdAt:1,updatedAt:1};
 const onDraft=jest.fn();
 await render(<AIWorkspace p={light} notes={[original]} onDraft={onDraft}/>);
 await fireEvent.press(screen.getByRole('button',{name:'استخدام: مصدر أصلي'}));
 await fireEvent.press(screen.getByRole('button',{name:'فتح المحرك المحلي'}));
 await act(()=>mockResult({questions:[{question:'حول ماذا تدور الكواكب؟',answer:'الشمس',evidence:'الكواكب تدور حول الشمس'}],sourceText:original.body,modelName:'mock.gguf'}));
 await fireEvent.press(screen.getByRole('button',{name:'مراجعة الأسئلة في المحرر'}));
 const draft=onDraft.mock.calls[0][0];
 expect(draft.body).toContain('المصدر: مصدر أصلي');
 expect(draft.body).not.toContain('[[مصدر أصلي]]');
 expect(draft).not.toHaveProperty('sourceNoteId');
 expect(graphEdges([original,{id:'generated-id',...draft}])).toEqual([]);
});

test('S007: quiz on no cards only alerts, without a study-specific route to create the missing content',async()=>{
 storage.readAll.mockResolvedValueOnce({notes:[],cards:[],reviews:[]});
 await render(<App/>);await screen.findByText('مساحتي');
 await fireEvent.press(screen.getByRole('tab',{name:'المراجعة'}));
 await fireEvent.press(screen.getByRole('button',{name:'اختبار اختيارات'}));
 expect(Alert.alert).toHaveBeenCalledWith('بطاقات غير كافية','أنشئ بطاقتين بإجابتين مختلفتين على الأقل.');
 expect(screen.queryByText('الاختبار السريع')).toBeNull();
});

test('S008: quiz completion keeps the score but removes questions, selections and source actions',async()=>{
 const cards=[{...mockCards[0],question:'السؤال الأول للاختبار',answer:'ألف'},{...mockCards[0],id:'c2',question:'السؤال الثاني للاختبار',answer:'باء'}];
 storage.readAll.mockResolvedValueOnce({notes:mockNotes,cards,reviews:[]});
 await render(<App/>);await screen.findByText('مساحتي');
 await fireEvent.press(screen.getByRole('tab',{name:'المراجعة'}));
 await fireEvent.press(screen.getByRole('button',{name:'اختبار اختيارات'}));
 await fireEvent.press(screen.getByText('ألف'));
 await fireEvent.press(screen.getByRole('button',{name:'السؤال التالي'}));
 await fireEvent.press(screen.getByText('ألف'));
 await fireEvent.press(screen.getByRole('button',{name:'عرض النتيجة'}));
 expect(screen.getByText('1 / 2')).toBeTruthy();
 expect(screen.getByText('نتيجة الاختبار')).toBeTruthy();
 expect(screen.queryByRole('button',{name:/مراجعة الأخطاء|فتح مصدر السؤال|تصحيح الإجابات/})).toBeNull();
 expect(screen.queryByText('باء')).toBeNull();
});

