import React, { useState } from 'react';
import { View } from 'react-native';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { KnowledgeGraph } from '../src/KnowledgeGraph';
import { Button, light } from '../src/ui';

jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('react-native-svg', () => {
  const { View, Text } = require('react-native');
  return { __esModule:true, default:View, Circle:View, G:View, Line:View, Text };
});
const notes = Array.from({length:31}, (_, i) => ({id:`n${i}`,title:`ملاحظة ${i}`,body:'',createdAt:1,updatedAt:1}));
notes[0].body = notes.slice(1).map(note=>`[[${note.title}]]`).join(' ');

function RouteHarness({ items=notes, onOpen=jest.fn() }) {
  const [visible,setVisible] = useState(true);
  const [session,setSession] = useState({query:'',page:0,relationPage:0,zoom:1,showList:false,pan:{x:0,y:0},selectedNoteId:null});
  return <View>
    <Button p={light} title="تبديل المسار للاختبار" onPress={()=>setVisible(value=>!value)} />
    {visible && <KnowledgeGraph notes={items} p={light} onOpen={onOpen} session={session} onSessionChange={setSession} />}
  </View>;
}
async function leaveAndReturn() {
  await fireEvent.press(screen.getByRole('button',{name:'تبديل المسار للاختبار'}));
  expect(screen.queryByLabelText('ابحث في جميع عناوين الملاحظات')).toBeNull();
  await fireEvent.press(screen.getByRole('button',{name:'تبديل المسار للاختبار'}));
}

test('route unmount preserves search, note page, zoom, list and selected note in the supplied session', async()=>{
  const onOpen=jest.fn();
  await render(<RouteHarness onOpen={onOpen} />);
  await fireEvent.changeText(screen.getByLabelText('ابحث في جميع عناوين الملاحظات'),'ملاحظة');
  await fireEvent.press(screen.getByRole('button',{name:'صفحة الملاحظات التالية'}));
  await fireEvent.press(screen.getByRole('button',{name:'تكبير الشبكة'}));
  await fireEvent.press(screen.getByRole('button',{name:'عرض الملاحظات كقائمة'}));
  await fireEvent.press(screen.getByRole('button',{name:'فتح ملاحظة 24 من قائمة الشبكة'}));
  expect(onOpen).toHaveBeenCalledWith(notes[24]);
  await leaveAndReturn();
  expect(screen.getByLabelText('ابحث في جميع عناوين الملاحظات').props.value).toBe('ملاحظة');
  expect(screen.getByText('صفحة 2 من 2')).toBeTruthy();
  expect(screen.getByText('120%')).toBeTruthy();
  expect(screen.getByRole('button',{name:'إخفاء قائمة الملاحظات'})).toBeTruthy();
  expect(screen.getByRole('button',{name:'فتح ملاحظة 24 من قائمة الشبكة',selected:true})).toBeTruthy();
});

test('pan snapshots are passed back as scroll offsets on remount and fit resets them (props only, not native scrolling)', async()=>{
  await render(<RouteHarness />);
  await fireEvent(screen.getByTestId('graph-viewport'),'layout',{nativeEvent:{layout:{width:320,height:405,x:0,y:0}}});
  for(let i=0;i<5;i++) await fireEvent.press(screen.getByRole('button',{name:'تكبير الشبكة'}));
  await fireEvent.scroll(screen.getByTestId('graph-pan-horizontal'),{nativeEvent:{contentOffset:{x:80,y:0}}});
  await fireEvent.scroll(screen.getByTestId('graph-pan-vertical'),{nativeEvent:{contentOffset:{x:0,y:60}}});
  await leaveAndReturn();
  expect(screen.getByTestId('graph-pan-horizontal').props.contentOffset).toEqual({x:80,y:0});
  expect(screen.getByTestId('graph-pan-vertical').props.contentOffset).toEqual({x:0,y:60});
  await fireEvent.press(screen.getByRole('button',{name:'ملاءمة الشبكة'}));
  expect(screen.getByTestId('graph-pan-horizontal').props.contentOffset).toEqual({x:0,y:0});
  expect(screen.getByTestId('graph-pan-vertical').props.contentOffset).toEqual({x:0,y:0});
});

test('relation page and off-page selected target survive leaving the route', async()=>{
  await render(<RouteHarness />);
  await fireEvent.press(screen.getByRole('button',{name:'صفحة العلاقات التالية'}));
  await fireEvent.press(screen.getByRole('button',{name:'فتح ملاحظة 30 المرتبطة بـ ملاحظة 0'}));
  await leaveAndReturn();
  expect(screen.getByText('صفحة العلاقات 2 من 2')).toBeTruthy();
  expect(screen.getByRole('button',{name:'فتح ملاحظة 30 المرتبطة بـ ملاحظة 0',selected:true})).toBeTruthy();
});

test('deleted selected notes and obsolete page numbers are cleared from the session', async()=>{
  const view=await render(<RouteHarness />);
  await fireEvent.press(screen.getByRole('button',{name:'صفحة الملاحظات التالية'}));
  await fireEvent.press(screen.getByTestId('graph-node-n24'));
  await view.rerender(<RouteHarness items={notes.slice(0,2)} />);
  expect(screen.getByText('الملاحظات 1–2 من 2')).toBeTruthy();
  await view.rerender(<RouteHarness />);
  await leaveAndReturn();
  expect(screen.getByText('صفحة 1 من 2')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button',{name:'صفحة الملاحظات التالية'}));
  expect(screen.getByTestId('graph-node-n24').props.accessibilityState?.selected).toBe(false);
});
