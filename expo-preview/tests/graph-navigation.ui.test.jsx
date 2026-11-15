import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import App from '../App';

const mockNotes=Array.from({length:25},(_,i)=>({id:`n${i}`,title:`ملاحظة ${i}`,body:'نص محفوظ',createdAt:1,updatedAt:1}));
jest.mock('../src/storage',()=>({
  openStorage:jest.fn(async()=>({})), readAll:jest.fn(async()=>({notes:mockNotes,cards:[],reviews:[]})),
  getSetting:jest.fn(async()=>null), setSetting:jest.fn(async()=>{}),
  saveNoteAndCards:jest.fn(), saveNote:jest.fn(), saveCard:jest.fn(), deleteNote:jest.fn(), deleteCard:jest.fn(),
  restoreBackup:jest.fn(), makeBackup:jest.fn(), recordReview:jest.fn(),
}));
jest.mock('react-native-safe-area-context',()=>require('react-native-safe-area-context/jest/mock').default);
jest.mock('expo-symbols',()=>({SymbolView:()=>null}));
jest.mock('react-native-svg',()=>{
  const {View,Text}=require('react-native');
  return {__esModule:true,default:View,Circle:View,G:View,Line:View,Text};
});
jest.mock('expo-file-system',()=>({Paths:{cache:'/cache'},File:class {uri='/cache/file';create(){};write=async()=>{};}}));
jest.mock('expo-sharing',()=>({isAvailableAsync:jest.fn(async()=>true),shareAsync:jest.fn(async()=>{})}));
jest.mock('expo-document-picker',()=>({getDocumentAsync:jest.fn()}));

async function openGraph() {
  await fireEvent.press(screen.getByRole('tab',{name:'الأدوات'}));
  await fireEvent.press(screen.getByRole('button',{name:'فتح شبكة أفكاري'}));
}

test('App retains graph view state after note modal and a real route unmount within one session', async()=>{
  await render(<App />); await screen.findByText('مساحتي');
  await openGraph();
  await fireEvent.changeText(screen.getByLabelText('ابحث في جميع عناوين الملاحظات'),'ملاحظة');
  await fireEvent.press(screen.getByRole('button',{name:'صفحة الملاحظات التالية'}));
  await fireEvent.press(screen.getByRole('button',{name:'تكبير الشبكة'}));
  await fireEvent.press(screen.getByTestId('graph-node-n24'));
  expect(screen.getByLabelText('المحتوى').props.value).toBe('نص محفوظ');
  await fireEvent.press(screen.getByRole('button',{name:'إغلاق'}));
  await fireEvent.press(screen.getByRole('tab',{name:'الملاحظات'}));
  expect(screen.queryByTestId('graph-canvas')).toBeNull();
  await openGraph();
  expect(screen.getByLabelText('ابحث في جميع عناوين الملاحظات').props.value).toBe('ملاحظة');
  expect(screen.getByText('صفحة 2 من 2')).toBeTruthy();
  expect(screen.getByText('120%')).toBeTruthy();
  expect(screen.getByTestId('graph-node-n24').props.accessibilityState.selected).toBe(true);
});
