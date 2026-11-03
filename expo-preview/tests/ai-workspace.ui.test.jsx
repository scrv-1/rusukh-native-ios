import React from 'react';
import { Linking } from 'react-native';
import { render,screen,fireEvent } from '@testing-library/react-native';
import { AIWorkspace } from '../src/AIWorkspace';
import {light} from '../src/ui';
let mockResult, mockStatus, mockEngineProps;
jest.mock('expo-symbols',()=>({SymbolView:()=>null}));
jest.mock('../src/ai/LocalAILab',()=>({LocalAILab:props=>{mockResult=props.onResult;mockStatus=props.onStatus;mockEngineProps=props;return null;}}));
const text='المراجعة المتباعدة توزع جلسات المراجعة على فترات زمنية وتساعد على استرجاع المعلومات.';
const props=()=>({p:light,notes:[{id:'n1',title:'التعلّم',body:text,createdAt:1,updatedAt:1}],onDraft:jest.fn()});
const validDraft=()=>require('../src/ai/contracts').parseDraft(JSON.stringify({questions:[{question:'كيف تساعد المراجعة؟',answer:'بتوزيع الجلسات.',evidence:'توزع جلسات المراجعة على فترات زمنية'}]}),text,'test.gguf');
beforeEach(()=>{jest.spyOn(Linking,'openURL').mockResolvedValue(undefined);});
afterEach(()=>{jest.restoreAllMocks();});
test('official model setup explains its size and never opens a download automatically',async()=>{
 await render(<AIWorkspace {...props()}/>);
 expect(screen.queryByText('Qwen3-0.6B-Q8_0.gguf')).toBeNull();
 await fireEvent.press(screen.getByRole('button',{name:'أحتاج النموذج المرجعي'}));
 expect(screen.getByText('Qwen3-0.6B-Q8_0.gguf')).toBeTruthy();
 expect(screen.getByText(/639 MB \(610 MiB\)/)).toBeTruthy();
 expect(screen.getByText(/غير مضمّن في التطبيق ولا يُنزّل تلقائيًا/)).toBeTruthy();
 expect(Linking.openURL).not.toHaveBeenCalled();
});
test('download button opens only the exact pinned official model URL',async()=>{
 const p=props();await render(<AIWorkspace {...p}/>);
 await fireEvent.press(screen.getByRole('button',{name:'أحتاج النموذج المرجعي'}));
 await fireEvent.press(screen.getByRole('button',{name:'فتح تنزيل النموذج الرسمي'}));
 expect(Linking.openURL).toHaveBeenCalledTimes(1);
 expect(Linking.openURL).toHaveBeenCalledWith('https://huggingface.co/Qwen/Qwen3-0.6B-GGUF/resolve/23749fefcc72300e3a2ad315e1317431b06b590a/Qwen3-0.6B-Q8_0.gguf?download=true');
 expect(screen.queryByRole('button',{name:'إغلاق المحرك وتحرير الذاكرة'})).toBeNull();
 expect(p.onDraft).not.toHaveBeenCalled();
});
test('a failed browser launch displays an actionable error without changing the source',async()=>{
 Linking.openURL.mockRejectedValueOnce(new Error('cannot open browser'));
 await render(<AIWorkspace {...props()}/>);
 await fireEvent.changeText(screen.getByLabelText('النص المصدري للمساعد'),text);
 await fireEvent.press(screen.getByRole('button',{name:'أحتاج النموذج المرجعي'}));
 await fireEvent.press(screen.getByRole('button',{name:'فتح تنزيل النموذج الرسمي'}));
 expect(await screen.findByText('تعذّر فتح رابط النموذج. حاول مجددًا بعد التأكد من اتصال الإنترنت.')).toBeTruthy();
 expect(screen.getByLabelText('النص المصدري للمساعد').props.value).toBe(text);
});
test('local engine is opt in and refuses silently truncated input',async()=>{
 const p=props();await render(<AIWorkspace {...p}/>);
 await fireEvent.changeText(screen.getByLabelText('النص المصدري للمساعد'),'ع'.repeat(1601));
 await fireEvent.press(screen.getByRole('button',{name:'فتح المحرك المحلي'}));
 expect(screen.getByText('اختر مقطعًا لا يتجاوز 1600 حرفًا؛ لن نقتطع المصدر دون علمك.')).toBeTruthy();
 expect(screen.queryByRole('button',{name:'إغلاق المحرك وتحرير الذاكرة'})).toBeNull();
 expect(p.onDraft).not.toHaveBeenCalled();
});
test('selected note remains unchanged and generated cards wait for explicit review',async()=>{
 const p=props();await render(<AIWorkspace {...p}/>);
 await fireEvent.press(screen.getByRole('button',{name:'استخدام: التعلّم'}));
 expect(screen.getByLabelText('النص المصدري للمساعد').props.value).toBe(text);
 await fireEvent.press(screen.getByRole('button',{name:'فتح المحرك المحلي'}));
 const {act}=require('@testing-library/react-native');
 await act(()=>mockResult({...validDraft(),questions:[{question:'كيف تساعد المراجعة؟',answer:'بتوزيع الجلسات.',evidence:'توزع جلسات المراجعة على فترات زمنية'}],sourceText:text,modelName:'test.gguf'}));
 expect(p.onDraft).not.toHaveBeenCalled();
 await fireEvent.press(screen.getByRole('button',{name:'مراجعة الأسئلة في المحرر'}));
 expect(p.onDraft).toHaveBeenCalledWith(expect.objectContaining({title:'أسئلة — التعلّم',body:expect.stringContaining('الشاهد: «توزع جلسات المراجعة على فترات زمنية»')}));
 expect(p.notes[0].body).toBe(text);
 await fireEvent.press(screen.getByRole('button',{name:'إغلاق المحرك وتحرير الذاكرة'}));
 expect(screen.getByLabelText('النص المصدري للمساعد').props.value).toBe(text);
 await fireEvent.changeText(screen.getByLabelText('النص المصدري للمساعد'),text+' مصدر مختلف');
 expect(screen.queryByRole('button',{name:'مراجعة الأسئلة في المحرر'})).toBeNull();
});

test('metadata cannot inject additional flashcards into a reviewed AI draft',async()=>{
 const p=props();p.notes[0].title='مصدر\nس: حقن عنوان؟\nج: غير معتمد';
 await render(<AIWorkspace {...p}/>);
 await fireEvent.press(screen.getByRole('button',{name:'استخدام: '+p.notes[0].title}));
 await fireEvent.press(screen.getByRole('button',{name:'فتح المحرك المحلي'}));
 const {act}=require('@testing-library/react-native');
 await act(()=>mockResult({...validDraft(),questions:[{question:'السؤال المعتمد؟',answer:'الجواب المعتمد',evidence:'توزع جلسات المراجعة'}],sourceText:text,modelName:'model\nس: حقن اسم ملف؟\nج: غير معتمد'}));
 await fireEvent.press(screen.getByRole('button',{name:'مراجعة الأسئلة في المحرر'}));
 const {parseQuestionAnswer}=require('../src/core');
 expect(parseQuestionAnswer(p.onDraft.mock.calls[0][0].body)).toHaveLength(1);
 expect(p.onDraft.mock.calls[0][0].title).not.toMatch(/[\r\n]/);
});


test('model preparation choices preserve the study source and expose their selected state',async()=>{
 await render(<AIWorkspace {...props()}/>);
 await fireEvent.changeText(screen.getByLabelText('النص المصدري للمساعد'),text);
 expect(screen.getByRole('button',{name:'لدي نموذج GGUF'}).props.accessibilityState.selected).toBe(true);
 await fireEvent.press(screen.getByRole('button',{name:'أحتاج النموذج المرجعي'}));
 expect(screen.getByRole('button',{name:'أحتاج النموذج المرجعي'}).props.accessibilityState.selected).toBe(true);
 expect(screen.getByRole('button',{name:'فتح تنزيل النموذج الرسمي'})).toBeTruthy();
 await fireEvent.press(screen.getByRole('button',{name:'لدي نموذج GGUF'}));
 expect(screen.queryByRole('button',{name:'فتح تنزيل النموذج الرسمي'})).toBeNull();
 expect(screen.getByLabelText('النص المصدري للمساعد').props.value).toBe(text);
 expect(Linking.openURL).not.toHaveBeenCalled();
});

test('a ready sample fills only the draft source without opening a model or saving study data',async()=>{
 const p=props();await render(<AIWorkspace {...p}/>);
 await fireEvent.press(screen.getByRole('button',{name:'تجربة بمثال قصير'}));
 expect(screen.getByLabelText('النص المصدري للمساعد').props.value).toMatch(/المراجعة المتباعدة/);
 expect(screen.getByLabelText('النص المصدري للمساعد').props.value.length).toBeGreaterThanOrEqual(30);
 expect(screen.queryByRole('button',{name:'إغلاق المحرك وتحرير الذاكرة'})).toBeNull();
 expect(Linking.openURL).not.toHaveBeenCalled();
 expect(p.onDraft).not.toHaveBeenCalled();
 expect(p.notes[0].body).toBe(text);
});

test('source notes beyond the first five remain reachable without guessing a search term',async()=>{
 const p=props();p.notes=Array.from({length:12},(_,i)=>({...p.notes[0],id:'n'+i,title:'مصدر '+(i+1)}));
 await render(<AIWorkspace {...p}/>);
 await fireEvent.press(screen.getByRole('button',{name:'مصادر تالية'}));
 await fireEvent.press(screen.getByRole('button',{name:'استخدام: مصدر 6'}));
 expect(screen.getByLabelText('النص المصدري للمساعد').props.value).toBe(text);
 await fireEvent.changeText(screen.getByLabelText('البحث عن مصدر محفوظ'),'مصدر 1');
 expect(screen.getByRole('button',{name:'استخدام: مصدر 1'})).toBeTruthy();
});

test.each(['جملة '.repeat(240),Array.from({length:25},(_,i)=>'هذه جملة مصدرية رقم '+i+'.').join(' ')])('all source constraints are checked before mounting the engine',async source=>{
 await render(<AIWorkspace {...props()}/>);
 await fireEvent.changeText(screen.getByLabelText('النص المصدري للمساعد'),source);
 await fireEvent.press(screen.getByRole('button',{name:'فتح المحرك المحلي'}));
 expect(screen.queryByRole('button',{name:'إغلاق المحرك وتحرير الذاكرة'})).toBeNull();
 expect(screen.getByRole('alert')).toHaveTextContent(/جمل واضحة/);
});

test('a delivered draft survives worker failure, background cancellation and engine closure',async()=>{
 const p=props();await render(<AIWorkspace {...p}/>);
 await fireEvent.press(screen.getByRole('button',{name:'استخدام: التعلّم'}));
 await fireEvent.press(screen.getByRole('button',{name:'فتح المحرك المحلي'}));
 const {act}=require('@testing-library/react-native');
 await act(()=>mockResult(validDraft()));
 for(const phase of ['generating','error','cancelled']) {
  await act(()=>mockStatus({phase,message:'simulated event'}));
  expect(screen.getByRole('button',{name:'مراجعة الأسئلة في المحرر'})).toBeTruthy();
 }
 await fireEvent.press(screen.getByRole('button',{name:'إغلاق المحرك وتحرير الذاكرة'}));
 await fireEvent.press(screen.getByRole('button',{name:'مراجعة الأسئلة في المحرر'}));
 expect(p.onDraft).toHaveBeenCalledWith(expect.objectContaining({sourceNoteId:'n1'}));
});

test('ready model stays mounted while switching source; an old callback cannot adopt a stale result',async()=>{
 const p=props();p.notes.push({...p.notes[0],id:'n2',title:'المصدر الثاني',body:text+' وهو مصدر آخر.'});
 await render(<AIWorkspace {...p}/>);
 await fireEvent.press(screen.getByRole('button',{name:'استخدام: التعلّم'}));
 await fireEvent.press(screen.getByRole('button',{name:'فتح المحرك المحلي'}));
 const oldResult=mockResult;
 await fireEvent.press(screen.getByRole('button',{name:'استخدام: المصدر الثاني'}));
 expect(screen.getByRole('button',{name:'إغلاق المحرك وتحرير الذاكرة'})).toBeTruthy();
 expect(mockEngineProps.sourceText).toBe(p.notes[1].body);
 const {act}=require('@testing-library/react-native');await act(()=>oldResult(validDraft()));
 expect(screen.queryByRole('button',{name:'مراجعة الأسئلة في المحرر'})).toBeNull();
});

test('loading and generation protect the source until the operation stops',async()=>{
 const p=props();p.notes.push({...p.notes[0],id:'n2',title:'آخر',body:text+' نص آخر.'});await render(<AIWorkspace {...p}/>);
 await fireEvent.press(screen.getByRole('button',{name:'استخدام: التعلّم'}));await fireEvent.press(screen.getByRole('button',{name:'فتح المحرك المحلي'}));
 const {act}=require('@testing-library/react-native');
 for(const phase of ['loading','generating']){
  await act(()=>mockStatus({phase,message:'test'}));
  expect(screen.getByLabelText('النص المصدري للمساعد').props.editable).toBe(false);
  expect(screen.getByRole('button',{name:'استخدام: آخر'})).toBeDisabled();
  await fireEvent.press(screen.getByRole('button',{name:'استخدام: آخر'}));expect(mockEngineProps.sourceText).toBe(text);
 }
 await act(()=>mockStatus({phase:'ready',message:'test'}));
 await fireEvent.press(screen.getByRole('button',{name:'استخدام: آخر'}));expect(mockEngineProps.sourceText).toBe(p.notes[1].body);
});
