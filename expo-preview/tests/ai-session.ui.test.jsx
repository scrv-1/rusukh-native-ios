import React from 'react';
import { View, Pressable, Text } from 'react-native';
import { act, render, renderHook, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { AI_STUDY_SESSION_KEY, parseAIStudySession, useAIStudySession } from '../src/ai/useAIStudySession';
import { AIWorkspace } from '../src/AIWorkspace';
import { parseDraft } from '../src/ai/contracts';
import { light } from '../src/ui';
import * as storage from '../src/storage';
const mockSettings=new Map();let mockEngine;
jest.mock('../src/storage',()=>({getSetting:jest.fn(async(_,key)=>mockSettings.get(key)??null),setSetting:jest.fn(async(_,key,value)=>{mockSettings.set(key,value);})}));
jest.mock('expo-symbols',()=>({SymbolView:()=>null}));
jest.mock('../src/ai/LocalAILab',()=>({LocalAILab:props=>{mockEngine=props;return null;}}));
const text='المراجعة المتباعدة توزع جلسات التعلم على فترات زمنية وتساعد على استرجاع المعلومات.';
const result=()=>parseDraft(JSON.stringify({questions:[{question:'كيف تتوزع الجلسات؟',answer:'على فترات زمنية.',evidence:'توزع جلسات التعلم على فترات زمنية'}]}),text,'test.gguf');
const session=()=>({version:1,sourceText:text,sourceTitle:'المصدر',sourceNote:{id:'original',createdAt:1,updatedAt:2},result:result()});
beforeEach(()=>{mockSettings.clear();storage.getSetting.mockImplementation(async(_,key)=>mockSettings.get(key)??null);storage.setSetting.mockImplementation(async(_,key,value)=>{mockSettings.set(key,value);});});
async function ready(){const db={};const hook=await renderHook(()=>useAIStudySession(db));await waitFor(()=>expect(hook.result.current.loading).toBe(false));return hook;}

test('a validated source snapshot and draft recover on restart without creating study data',async()=>{
 const saved=session();mockSettings.set(AI_STUDY_SESSION_KEY,JSON.stringify(saved));const hook=await ready();
 expect(hook.result.current.value).toEqual(saved);expect(hook.result.current.hasPending).toBe(true);
 expect(hook.result.current.editable).toBe(true);expect(storage.setSetting).not.toHaveBeenCalled();
});

test('the latest text stays in memory if persistence fails, and retry saves that exact revision',async()=>{
 const hook=await ready();storage.setSetting.mockRejectedValueOnce(new Error('disk full'));
 const changed={...session(),sourceText:text+' إضافة جديدة',result:null};
 await act(async()=>{expect(await hook.result.current.update(changed)).toBe(false);});
 expect(hook.result.current.getCurrent()).toEqual(changed);expect(hook.result.current.value).toEqual(changed);expect(hook.result.current.status).toBe('error');
 await act(async()=>{expect(await hook.result.current.retry()).toBe(true);});
 expect(JSON.parse(mockSettings.get(AI_STUDY_SESSION_KEY))).toEqual(changed);
});

test('a slow old write cannot replace the latest in-memory text or undo explicit discard',async()=>{
 const hook=await ready();let release;const pending=new Promise(resolve=>{release=resolve;});
 storage.setSetting.mockImplementationOnce(async(_,key,value)=>{await pending;mockSettings.set(key,value);});
 let first,second,discard;
 await act(async()=>{first=hook.result.current.update(session());second=hook.result.current.update({...session(),sourceTitle:'الأحدث'});});
 expect(hook.result.current.value.sourceTitle).toBe('الأحدث');
 await act(async()=>{discard=hook.result.current.clear();});
 expect(hook.result.current.getCurrent()).toBeNull();
 await act(async()=>{release();expect(await first).toBe(true);expect(await second).toBe(true);expect(await discard).toBe(true);});
 expect(mockSettings.get(AI_STUDY_SESSION_KEY)).toBe('null');expect(hook.result.current.value).toBeNull();
});

test.each(['{broken',JSON.stringify({...session(),version:9}),JSON.stringify({...session(),sourceText:'x'.repeat(1_000_001)}),JSON.stringify({...session(),result:{...result(),sourceText:text+' آخر'}})])('an unreadable or invalid slot is preserved and editing stays blocked',async raw=>{
 mockSettings.set(AI_STUDY_SESSION_KEY,raw);const hook=await ready();expect(hook.result.current.status).toBe('error');expect(hook.result.current.editable).toBe(false);
 await act(async()=>{expect(await hook.result.current.update(session())).toBe(false);expect(await hook.result.current.clear()).toBe(false);});
 expect(storage.setSetting).not.toHaveBeenCalled();expect(mockSettings.get(AI_STUDY_SESSION_KEY)).toBe(raw);
});

test('a failed recovery read can retry without first overwriting the saved session',async()=>{
 const saved=session();mockSettings.set(AI_STUDY_SESSION_KEY,JSON.stringify(saved));storage.getSetting.mockRejectedValueOnce(new Error('busy'));
 const hook=await ready();expect(hook.result.current.editable).toBe(false);
 await act(async()=>{expect(await hook.result.current.retry()).toBe(true);});
 expect(hook.result.current.value).toEqual(saved);expect(storage.setSetting).not.toHaveBeenCalled();
});

test('an initial slow read blocks editing and cannot erase a newer accepted value',async()=>{
 let release;storage.getSetting.mockImplementationOnce(()=>new Promise(resolve=>{release=resolve;}));
 const db={};const hook=await renderHook(()=>useAIStudySession(db));
 await act(async()=>{expect(await hook.result.current.update(session())).toBe(false);release(null);});
 await act(async()=>{expect(await hook.result.current.update(session())).toBe(true);});
 expect(hook.result.current.value.sourceText).toBe(text);
});

test('switching database generations rejects queued writes intended for the old connection',async()=>{
 const oldDb={},nextDb={};let release;
 const hook=await renderHook(({db})=>useAIStudySession(db),{initialProps:{db:oldDb}});
 await waitFor(()=>expect(hook.result.current.loading).toBe(false));
 storage.setSetting.mockImplementationOnce(async(_,key,value)=>{await new Promise(resolve=>{release=resolve;});mockSettings.set(key,value);});
 let first,queued;
 await act(async()=>{first=hook.result.current.update(session());queued=hook.result.current.update({...session(),sourceTitle:'old queued'});});
 await hook.rerender({db:nextDb});
 await act(async()=>{release();expect(await first).toBe(true);expect(await queued).toBe(false);});
 await waitFor(()=>expect(hook.result.current.loading).toBe(false));
 expect(storage.setSetting).toHaveBeenCalledTimes(1);expect(storage.setSetting.mock.calls[0][0]).toBe(oldDb);
});

test('write snapshots cannot be mutated by callers while waiting for storage',async()=>{
 const hook=await ready();const pending=session();let write;
 await act(async()=>{write=hook.result.current.update(pending);pending.sourceText='tampered';pending.result.questions[0].answer='tampered';await write;});
 expect(hook.result.current.value.sourceText).toBe(text);
 expect(hook.result.current.value.result.questions[0].answer).toBe('على فترات زمنية.');
 expect(JSON.parse(mockSettings.get(AI_STUDY_SESSION_KEY)).sourceText).toBe(text);
});

test('serialization accepts the full bounded source even when JSON escapes every character',()=>{
 const value={...session(),sourceText:'\u0001'.repeat(1_000_000),result:null};
 expect(parseAIStudySession(JSON.stringify(value))).toEqual(value);
});

test('tab unmount preserves pasted source and generated draft; application remount recovers them from storage',async()=>{
 const db={},onDraft=jest.fn();
 function Host(){const ai=useAIStudySession(db);const [visible,setVisible]=React.useState(true);return <View><Pressable accessibilityRole="button" accessibilityLabel="toggle tab" onPress={()=>setVisible(!visible)}><Text>toggle</Text></Pressable>{visible&&<AIWorkspace p={light} notes={[]} onDraft={onDraft} session={ai}/>}</View>;}
 await render(<Host/>);await waitFor(()=>expect(screen.getByLabelText('النص المصدري للمساعد').props.editable).toBe(true));
 await fireEvent.changeText(screen.getByLabelText('النص المصدري للمساعد'),text);
 await fireEvent.press(screen.getByRole('button',{name:'فتح المحرك المحلي'}));
 await act(()=>mockEngine.onResult(result()));
 await fireEvent.press(screen.getByRole('button',{name:'toggle tab'}));await fireEvent.press(screen.getByRole('button',{name:'toggle tab'}));
 expect(screen.getByLabelText('النص المصدري للمساعد').props.value).toBe(text);
 expect(screen.getByRole('button',{name:'مراجعة الأسئلة في المحرر'})).toBeTruthy();
 expect(screen.queryByRole('button',{name:'إغلاق المحرك وتحرير الذاكرة'})).toBeNull();expect(onDraft).not.toHaveBeenCalled();
 await waitFor(()=>expect(JSON.parse(mockSettings.get(AI_STUDY_SESSION_KEY)).result).not.toBeNull());
 await screen.unmount();await render(<Host/>);
 expect(await screen.findByRole('button',{name:'مراجعة الأسئلة في المحرر'})).toBeTruthy();
 expect(screen.getByLabelText('النص المصدري للمساعد').props.value).toBe(text);expect(onDraft).not.toHaveBeenCalled();
});

test.each([[],[{id:'original',title:'بديل',body:text,createdAt:50,updatedAt:2}],[{id:'original',title:'تعديل',body:text,createdAt:1,updatedAt:3}]].map(notes=>[notes]))('missing, replaced or changed source never attaches the recovered draft to a current note',async notes=>{
 const saved=session();mockSettings.set(AI_STUDY_SESSION_KEY,JSON.stringify(saved));const db={},onDraft=jest.fn();
 function Host(){const ai=useAIStudySession(db);return <AIWorkspace p={light} notes={notes} onDraft={onDraft} session={ai}/>;}
 await render(<Host/>);await fireEvent.press(await screen.findByRole('button',{name:'مراجعة الأسئلة في المحرر'}));
 expect(onDraft.mock.calls[0][0].sourceNoteId).toBeUndefined();expect(onDraft.mock.calls[0][0].body).toContain('مرجع المصدر الأصلي: original');expect(onDraft.mock.calls[0][0].body).toContain(text);
});
