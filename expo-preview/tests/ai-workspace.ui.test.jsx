import React from 'react';
import { Linking } from 'react-native';
import { render,screen,fireEvent } from '@testing-library/react-native';
import { AIWorkspace } from '../src/AIWorkspace';
import {light} from '../src/ui';
let mockResult;
jest.mock('expo-symbols',()=>({SymbolView:()=>null}));
jest.mock('../src/ai/LocalAILab',()=>({LocalAILab:({onResult})=>{mockResult=onResult;return null;}}));
const text='المراجعة المتباعدة توزع جلسات المراجعة على فترات زمنية وتساعد على استرجاع المعلومات.';
const props=()=>({p:light,notes:[{id:'n1',title:'التعلّم',body:text,createdAt:1,updatedAt:1}],onDraft:jest.fn()});
beforeEach(()=>{jest.spyOn(Linking,'openURL').mockResolvedValue(undefined);});
afterEach(()=>{jest.restoreAllMocks();});
test('official model setup explains its size and never opens a download automatically',async()=>{
 await render(<AIWorkspace {...props()}/>);
 expect(screen.getByText('Qwen3-0.6B-Q8_0.gguf')).toBeTruthy();
 expect(screen.getByText(/639 MB \(610 MiB\)/)).toBeTruthy();
 expect(screen.getByText(/غير مضمّن في التطبيق ولا يُنزّل تلقائيًا/)).toBeTruthy();
 expect(Linking.openURL).not.toHaveBeenCalled();
});
test('download button opens only the exact pinned official model URL',async()=>{
 const p=props();await render(<AIWorkspace {...p}/>);
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
 await fireEvent.press(screen.getByRole('button',{name:'فتح تنزيل النموذج الرسمي'}));
 expect(await screen.findByText('تعذّر فتح رابط النموذج. حاول مجددًا بعد التأكد من اتصال الإنترنت.')).toBeTruthy();
 expect(screen.getByLabelText('النص المصدري للمساعد').props.value).toBe(text);
});
test('local engine is opt in and refuses silently truncated input',async()=>{
 const p=props();await render(<AIWorkspace {...p}/>);
 await fireEvent.changeText(screen.getByLabelText('النص المصدري للمساعد'),'ع'.repeat(1601));
 await fireEvent.press(screen.getByRole('button',{name:'فتح المحرك المحلي'}));
 expect(screen.getByText('اختر مقطعًا بين 30 و1600 حرف. لن نختصر مصدرَك دون علمك.')).toBeTruthy();
 expect(screen.queryByRole('button',{name:'إغلاق المحرك وتحرير الذاكرة'})).toBeNull();
 expect(p.onDraft).not.toHaveBeenCalled();
});
test('selected note remains unchanged and generated cards wait for explicit review',async()=>{
 const p=props();await render(<AIWorkspace {...p}/>);
 await fireEvent.press(screen.getByRole('button',{name:'استخدام: التعلّم'}));
 expect(screen.getByLabelText('النص المصدري للمساعد').props.value).toBe(text);
 await fireEvent.press(screen.getByRole('button',{name:'فتح المحرك المحلي'}));
 const {act}=require('@testing-library/react-native');
 await act(()=>mockResult({questions:[{question:'كيف تساعد المراجعة؟',answer:'بتوزيع الجلسات.',evidence:'توزع جلسات المراجعة على فترات زمنية'}],sourceText:text,modelName:'test.gguf'}));
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
 await act(()=>mockResult({questions:[{question:'السؤال المعتمد؟',answer:'الجواب المعتمد',evidence:'توزع جلسات المراجعة'}],sourceText:text,modelName:'model\nس: حقن اسم ملف؟\nج: غير معتمد'}));
 await fireEvent.press(screen.getByRole('button',{name:'مراجعة الأسئلة في المحرر'}));
 const {parseQuestionAnswer}=require('../src/core');
 expect(parseQuestionAnswer(p.onDraft.mock.calls[0][0].body)).toHaveLength(1);
 expect(p.onDraft.mock.calls[0][0].title).not.toMatch(/[\r\n]/);
});
