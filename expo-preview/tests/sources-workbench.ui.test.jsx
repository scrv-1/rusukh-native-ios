import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SourcesWorkbench } from '../src/SourcesWorkbench';
import { light } from '../src/ui';
import * as picker from 'expo-document-picker';

let mockPdfProps;
let mockSize=100;
let mockText='س: ما العلم؟\nج: معرفة';
const mockReadBase64=jest.fn(async()=> 'JVBERi0xLjQK');
const mockReadText=jest.fn(async()=>mockText);
jest.mock('expo-symbols',()=>({SymbolView:()=>null}));
jest.mock('expo-document-picker',()=>({getDocumentAsync:jest.fn()}));
jest.mock('expo-file-system',()=>({File:class {constructor(uri){this.uri=uri;}get size(){return mockSize;}base64(){return mockReadBase64();}text(){return mockReadText();}}}));
jest.mock('../src/pdf/PdfTextExtractor',()=>({PdfTextExtractor:props=>{mockPdfProps=props;return null;}}));
jest.mock('../src/media/MediaCapturePanel',()=>({MediaCapturePanel:()=>{const {Text}=require('react-native');return <Text>أداة التصوير والتسجيل</Text>;}}),{virtual:true});

const onDraft=jest.fn(),onImportText=jest.fn();
const pdfResult={status:'text',title:'درس',body:'المصدر: درس.pdf\n[صفحة 1]\nنص مقروء',pageCount:2,pages:[],emptyPages:[2],warnings:['صفحة تحتاج OCR؛ لم ننفّذه.']};
async function start(){await render(<SourcesWorkbench p={light} notes={[]} onDraft={onDraft} onImportText={onImportText} />);}
async function press(title){await fireEvent.press(screen.getByRole('button',{name:title}));}
beforeEach(()=>{
  mockPdfProps=undefined;mockSize=100;mockText='س: ما العلم؟\nج: معرفة';
  onDraft.mockClear();onImportText.mockClear();mockReadBase64.mockClear();mockReadText.mockClear();
  picker.getDocumentAsync.mockReset();
});

test('starts with lightweight text import and mounts other tools only on selection',async()=>{
  await start();
  expect(screen.queryByLabelText('رابط YouTube')).toBeNull();
  expect(screen.queryByText('أداة التصوير والتسجيل')).toBeNull();
  expect(mockPdfProps).toBeUndefined();
  await press('اختيار مصدر من الملفات');expect(onImportText).toHaveBeenCalledTimes(1);
  await press('كاميرا وصوت');expect(screen.getByText('أداة التصوير والتسجيل')).toBeTruthy();
  await press('نص وملفات');expect(screen.queryByText('أداة التصوير والتسجيل')).toBeNull();
});

test('YouTube rejects deceptive URLs before preview and writes no draft',async()=>{
  await start();await press('فيديو YouTube');
  await fireEvent.changeText(screen.getByLabelText('رابط YouTube'),'https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ');
  await fireEvent.changeText(screen.getByLabelText('نص التفريغ'),'محتوى');
  await press('معاينة التفريغ');
  expect(screen.getByText('أدخل رابط HTTPS صحيحًا لفيديو YouTube.')).toBeTruthy();
  expect(screen.queryByRole('button',{name:'مراجعة مسودة YouTube'})).toBeNull();
  expect(onDraft).not.toHaveBeenCalled();
});

test('YouTube preview survives tool switches and creates a draft only after review',async()=>{
  await start();await press('فيديو YouTube');
  await fireEvent.changeText(screen.getByLabelText('رابط YouTube'),'https://youtu.be/dQw4w9WgXcQ');
  await fireEvent.changeText(screen.getByLabelText('نص التفريغ'),mockText);
  await press('معاينة التفريغ');
  expect(onDraft).not.toHaveBeenCalled();
  expect(screen.getByText('1 مقطع · 1 سؤال وجواب مكتوب صراحة')).toBeTruthy();
  await press('نص وملفات');await press('فيديو YouTube');
  expect(screen.getByLabelText('نص التفريغ').props.value).toBe(mockText);
  await press('مراجعة مسودة YouTube');
  expect(onDraft).toHaveBeenCalledWith(expect.objectContaining({title:'تفريغ YouTube',body:expect.stringContaining(mockText)}));
  await fireEvent.changeText(screen.getByLabelText('نص التفريغ'),'تعديل جديد');
  expect(screen.queryByRole('button',{name:'مراجعة مسودة YouTube'})).toBeNull();
});

test('cancelled PDF picker does not start extraction or write a draft',async()=>{
  picker.getDocumentAsync.mockResolvedValue({canceled:true,assets:null});
  await start();await press('قراءة PDF');await press('اختيار ملف PDF');
  expect(mockPdfProps).toBeUndefined();expect(mockReadBase64).not.toHaveBeenCalled();
  expect(onDraft).not.toHaveBeenCalled();
  expect(screen.getByRole('button',{name:'اختيار ملف PDF'})).toBeEnabled();
});

test('PDF size limit is checked before loading file bytes',async()=>{
  picker.getDocumentAsync.mockResolvedValue({canceled:false,assets:[{uri:'file:///large.pdf',name:'large.pdf',size:10*1024*1024+1}]});
  await start();await press('قراءة PDF');await press('اختيار ملف PDF');
  await screen.findByText('الحد الأقصى لملف PDF هو 10 ميغابايت.');
  expect(mockReadBase64).not.toHaveBeenCalled();expect(mockPdfProps).toBeUndefined();
  expect(onDraft).not.toHaveBeenCalled();
});

test('PDF extraction produces a warning-bearing preview before explicit draft creation',async()=>{
  picker.getDocumentAsync.mockResolvedValue({canceled:false,assets:[{uri:'file:///درس.pdf',name:'درس.pdf',size:100}]});
  await start();await press('قراءة PDF');await press('اختيار ملف PDF');
  await waitFor(()=>expect(mockPdfProps?.request.filename).toBe('درس.pdf'));
  await act(async()=>{mockPdfProps.onExtract(pdfResult);});
  expect(onDraft).not.toHaveBeenCalled();
  expect(screen.getByText('صفحة تحتاج OCR؛ لم ننفّذه.')).toBeTruthy();
  await press('فيديو YouTube');await press('قراءة PDF');
  await press('مراجعة مسودة PDF');
  expect(onDraft).toHaveBeenCalledWith({title:'درس',body:pdfResult.body});
});

test('cancel ignores late PDF engine results',async()=>{
  picker.getDocumentAsync.mockResolvedValue({canceled:false,assets:[{uri:'file:///x.pdf',name:'x.pdf',size:100}]});
  await start();await press('قراءة PDF');await press('اختيار ملف PDF');
  await waitFor(()=>expect(mockPdfProps).toBeTruthy());const lateExtract=mockPdfProps.onExtract;
  await press('إلغاء القراءة');
  await act(async()=>{lateExtract(pdfResult);});
  expect(screen.queryByRole('button',{name:'مراجعة مسودة PDF'})).toBeNull();
  expect(onDraft).not.toHaveBeenCalled();
  expect(screen.getByRole('button',{name:'اختيار ملف PDF'})).toBeEnabled();
});

test('switching tools invalidates a pending picker so it cannot replace current state',async()=>{
  let release;picker.getDocumentAsync.mockImplementationOnce(()=>new Promise(resolve=>{release=resolve;}));
  await start();await press('قراءة PDF');await press('اختيار ملف PDF');
  await press('فيديو YouTube');
  await act(async()=>{release({canceled:false,assets:[{uri:'file:///old.pdf',name:'old.pdf',size:100}]});});
  expect(mockReadBase64).not.toHaveBeenCalled();expect(mockPdfProps).toBeUndefined();
  expect(screen.getByLabelText('رابط YouTube')).toBeTruthy();
  expect(onDraft).not.toHaveBeenCalled();
});

test('large transcript files are rejected before text is read',async()=>{
  picker.getDocumentAsync.mockResolvedValue({canceled:false,assets:[{uri:'file:///x.srt',name:'x.srt',size:1024*1024+1}]});
  await start();await press('فيديو YouTube');await press('اختيار ملف تفريغ');
  await screen.findByText('الحد الأقصى للتفريغ 1 ميغابايت.');
  expect(mockReadText).not.toHaveBeenCalled();expect(onDraft).not.toHaveBeenCalled();
});

test('image-only PDF displays its limit honestly without a saveable empty draft',async()=>{
  picker.getDocumentAsync.mockResolvedValue({canceled:false,assets:[{uri:'file:///scan.pdf',name:'scan.pdf',size:100}]});
  await start();await press('قراءة PDF');await press('اختيار ملف PDF');
  await waitFor(()=>expect(mockPdfProps).toBeTruthy());
  await act(async()=>{mockPdfProps.onExtract({...pdfResult,status:'no-text',body:'',warnings:['لم نجد نصًا قابلًا للاستخراج؛ لم نُجرِ OCR.']});});
  expect(screen.queryByRole('button',{name:'مراجعة مسودة PDF'})).toBeNull();
  expect(screen.getByText('لم نجد نصًا قابلًا للاستخراج؛ لم نُجرِ OCR.')).toBeTruthy();
  expect(onDraft).not.toHaveBeenCalled();
});
