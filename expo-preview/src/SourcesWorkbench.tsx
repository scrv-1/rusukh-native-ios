import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, View } from 'react-native';
import { File } from 'expo-file-system';
import * as DocumentPicker from 'expo-document-picker';
import { arabicRow, Button, Field, Label, Palette, Panel } from './ui';
import { MAX_SOURCE_BYTES } from './sources';
import { parseYouTubeUrl, prepareYouTubeSource, TranscriptFormat, YouTubeSource } from './youtube';
import { MAX_PDF_BYTES, PdfRequest, PdfResult } from './pdf/contracts';
import type { Note } from './types';

type Mode = 'text' | 'pdf' | 'youtube' | 'media';
type Props = { p: Palette; notes: Note[]; onDraft: (draft: {title:string;body:string}) => void; onImportText: () => void };
const MODES: {id:Mode;title:string}[] = [{id:'text',title:'نص وملفات'}, {id:'pdf',title:'قراءة PDF'}, {id:'youtube',title:'فيديو YouTube'}, {id:'media',title:'كاميرا وصوت'}];

/** Only the selected tool is mounted. Forms/previews survive tool switches in this screen. */
export function SourcesWorkbench({p, notes, onDraft, onImportText}: Props) {
  const [mode,setMode] = useState<Mode>('text');
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  const [message,setMessage] = useState('');
  const [videoUrl,setVideoUrl] = useState('');
  const [videoTitle,setVideoTitle] = useState('تفريغ YouTube');
  const [transcript,setTranscript] = useState('');
  const [format,setFormat] = useState<TranscriptFormat>('text');
  const [videoPreview,setVideoPreview] = useState<YouTubeSource|null>(null);
  const [pdfRequest,setPdfRequest] = useState<PdfRequest|null>(null);
  const [pdfPreview,setPdfPreview] = useState<PdfResult|null>(null);
  const [pdfProgress,setPdfProgress] = useState('');
  const generation = useRef(0);
  const alive = useRef(true);
  const operationLock = useRef(false);
  useEffect(() => { alive.current=true; return () => {alive.current=false; generation.current++;}; },[]);
  const isCurrent = (id:number) => alive.current && generation.current === id;
  function cancelRead() {
    generation.current++; operationLock.current=false; setBusy(false); setPdfRequest(null); setPdfProgress('');
  }
  function chooseMode(next:Mode) {
    if (next === mode) return;
    const cancelled = busy || !!pdfRequest;
    cancelRead(); setMode(next); setError('');
    setMessage(cancelled ? 'أُلغيت القراءة الجارية. المعاينات المكتملة وحقولك ما زالت هنا.' : '');
  }
  function changedVideo(change:()=>void) { change(); setVideoPreview(null); setError(''); }
  async function openVideo(url:string) {
    const safe = parseYouTubeUrl(url);
    if (!safe) { setError('رابط الفيديو غير صالح.'); return; }
    try { await Linking.openURL(url); } catch { if (alive.current) setError('تعذّر فتح YouTube. حاول فتح الرابط من متصفحك.'); }
  }
  function makeVideoPreview() {
    try { setError(''); setVideoPreview(prepareYouTubeSource(videoUrl,transcript,format,videoTitle)); }
    catch(error) { setVideoPreview(null); setError(error instanceof Error ? error.message : 'تعذّرت قراءة التفريغ.'); }
  }
  async function pickTranscript() {
    if (operationLock.current) return;
    operationLock.current=true; const id=++generation.current; setBusy(true); setError(''); setMessage('');
    try {
      const selected=await DocumentPicker.getDocumentAsync({type:'*/*',copyToCacheDirectory:true});
      if (!isCurrent(id) || selected.canceled || !selected.assets[0]) return;
      const asset=selected.assets[0];
      const extension=asset.name.split('.').pop()?.toLowerCase();
      if (!['txt','srt','vtt'].includes(extension ?? '')) throw new Error('اختر ملف تفريغ TXT أو SRT أو VTT.');
      const file=new File(asset.uri);
      if (Math.max(asset.size ?? 0,file.size ?? 0)>MAX_SOURCE_BYTES) throw new Error('الحد الأقصى للتفريغ 1 ميغابايت.');
      const text=await file.text();
      if (!isCurrent(id)) return;
      // Full validation occurs in preview; selecting a file never writes notes.
      setTranscript(text); setFormat(extension === 'srt' ? 'srt' : extension === 'vtt' ? 'vtt' : 'text');
      setVideoTitle(asset.name.replace(/\.[^.]+$/,'').slice(0,160)); setVideoPreview(null);
      setMessage(`تم اختيار ${asset.name}. راجع المعاينة قبل إضافة مسودة.`);
    } catch(error) { if (isCurrent(id)) setError(error instanceof Error ? error.message : 'تعذّر فتح الملف.'); }
    finally { if (isCurrent(id)) {operationLock.current=false;setBusy(false);} }
  }
  async function pickPdf() {
    if (operationLock.current) return;
    operationLock.current=true; const id=++generation.current; setBusy(true);setError('');setMessage('');setPdfProgress('');
    let extracting=false;
    try {
      const selected=await DocumentPicker.getDocumentAsync({type:'application/pdf',copyToCacheDirectory:true});
      if (!isCurrent(id) || selected.canceled || !selected.assets[0]) return;
      const asset=selected.assets[0];
      if (!/\.pdf$/i.test(asset.name) && asset.mimeType !== 'application/pdf') throw new Error('اختر ملف PDF.');
      const file=new File(asset.uri);
      if (Math.max(asset.size ?? 0,file.size ?? 0)>MAX_PDF_BYTES) throw new Error('الحد الأقصى لملف PDF هو 10 ميغابايت.');
      const base64=await file.base64();
      if (!isCurrent(id)) return;
      if (!base64 || base64.length>Math.ceil(MAX_PDF_BYTES/3)*4) throw new Error('ملف PDF فارغ أو يتجاوز حد 10 ميغابايت.');
      extracting=true;setPdfRequest({id:String(id),filename:asset.name,base64});setPdfProgress('جارٍ قراءة صفحات PDF محليًا…');
    } catch(error) { if (isCurrent(id)) setError(error instanceof Error ? error.message : 'تعذّر فتح PDF.'); }
    finally { if (isCurrent(id) && !extracting) {operationLock.current=false;setBusy(false);} }
  }
  // Lazy loading avoids paying PDF engine / media startup costs on every app launch.
  const PdfExtractor = mode === 'pdf' && pdfRequest ? require('./pdf/PdfTextExtractor').PdfTextExtractor as typeof import('./pdf/PdfTextExtractor').PdfTextExtractor : null;
  const MediaPanel = mode === 'media' ? require('./media/MediaCapturePanel').MediaCapturePanel as React.ComponentType<{p:Palette}> : null;
  return <View style={{gap:16}}>
    <View style={{gap:5}}>
      <Label p={p} size={30} weight="800" role="header">مصادري</Label>
      <Label p={p} size={13} color={p.muted}>اختر أداة واحدة. راجع النص قبل إضافته إلى ملاحظاتك.</Label>
    </View>
    <View style={{flexDirection:arabicRow,flexWrap:'wrap',gap:8}}>
      {MODES.map(item=><Button key={item.id} p={p} title={item.title} tone={mode === item.id ? 'primary' : 'secondary'} onPress={()=>chooseMode(item.id)} />)}
    </View>
    {!!message && <Label p={p} size={13} color={p.muted}>{message}</Label>}
    {!!error && <Label p={p} color={p.danger}>{error}</Label>}
    {mode === 'text' && <Panel p={p}>
      <Label p={p} size={19} weight="700" role="header">أضف نصًا أو تفريغ محاضرة</Label>
      <Label p={p} size={14} color={p.muted}>TXT وMarkdown وSRT وVTT حتى 1 ميغابايت. تختار ملفًا من جهازك ثم تراجعه في محرر الملاحظة.</Label>
      <Button p={p} title="اختيار مصدر من الملفات" icon="square.and.arrow.down" onPress={onImportText} />
      <Label p={p} size={12} color={p.muted}>{notes.length} ملاحظة محفوظة. لا تُرفع النصوص تلقائيًا إلى خادم.</Label>
    </Panel>}
    {mode === 'youtube' && <>
      <Panel p={p}>
        <Label p={p} size={19} weight="700" role="header">فيديو وتفريغ موثّق</Label>
        <Label p={p} size={13} color={p.muted}>أضف رابط الفيديو وتفريغًا تملكه أو يتيحه صاحبه. لا تُنزّل هذه الأداة الصوت أو الترجمة تلقائيًا.</Label>
        <Field p={p} label="رابط YouTube" value={videoUrl} onChangeText={v=>changedVideo(()=>setVideoUrl(v))} maxLength={2048} editable={!busy} placeholder="https://www.youtube.com/watch?v=…" />
        <Field p={p} label="عنوان المصدر" value={videoTitle} onChangeText={v=>changedVideo(()=>setVideoTitle(v))} maxLength={160} editable={!busy} />
        <Button p={p} title="اختيار ملف تفريغ" tone="secondary" disabled={busy} onPress={()=>void pickTranscript()} />
        <Field p={p} label="نص التفريغ" multiline value={transcript} onChangeText={v=>changedVideo(()=>setTranscript(v))} editable={!busy} maxLength={1000000} placeholder="الصق التفريغ هنا، أو اختر ملف SRT / VTT" />
        <View style={{flexDirection:arabicRow,flexWrap:'wrap',gap:8}}>
          {([['text','نص عادي'],['srt','SRT'],['vtt','VTT']] as [TranscriptFormat,string][]).map(([kind,label])=><Button p={p} key={kind} title={label} tone={format === kind ? 'primary' : 'secondary'} compact disabled={busy} onPress={()=>changedVideo(()=>setFormat(kind))} />)}
        </View>
        <Button p={p} title="معاينة التفريغ" disabled={busy} onPress={makeVideoPreview} />
        <Button p={p} title="فتح الفيديو في YouTube" tone="plain" disabled={!parseYouTubeUrl(videoUrl)} onPress={()=>void openVideo(videoUrl.trim())} />
      </Panel>
      {videoPreview && <Panel p={p}>
        <Label p={p} weight="700" role="header">معاينة المصدر</Label>
        <Label p={p} size={13} color={p.muted}>{videoPreview.segments.length} مقطع · {videoPreview.questions.length} سؤال وجواب مكتوب صراحة</Label>
        <Label p={p} size={14} numberOfLines={8}>{videoPreview.body}</Label>
        {videoPreview.segments.filter(s=>s.startMs !== null).slice(0,3).map((segment,index)=><Button p={p} key={segment.id} title={`فتح المقطع ${index+1} عند ${Math.floor(segment.startMs!/1000)} ثانية`} tone="plain" onPress={()=>void openVideo(segment.url)} />)}
        <Label p={p} size={12} color={p.muted}>استخراج الأسئلة المكتوبة ليس توليدًا بالذكاء الاصطناعي. ستظل التوقيتات ورابط المصدر داخل النص.</Label>
        <Button p={p} title="مراجعة مسودة YouTube" onPress={()=>onDraft({title:videoPreview.title,body:videoPreview.body})} />
      </Panel>}
    </>}
    {mode === 'pdf' && <>
      <Panel p={p}>
        <Label p={p} size={19} weight="700" role="header">اقرأ PDF على جهازك</Label>
        <Label p={p} size={14} color={p.muted}>حتى 10 ميغابايت و50 صفحة. نستخرج النص مع أرقام الصفحات؛ الملفات المصوّرة قد تحتاج OCR غير متاح هنا.</Label>
        <Button p={p} title="اختيار ملف PDF" disabled={busy} onPress={()=>void pickPdf()} />
        {!!pdfProgress && <Label p={p} size={13}>{pdfProgress}</Label>}
      </Panel>
      {pdfPreview && <Panel p={p}>
        <Label p={p} weight="700" role="header">{pdfPreview.title}</Label>
        <Label p={p} size={13} color={p.muted}>{pdfPreview.pageCount} صفحة · {pdfPreview.emptyPages.length} صفحة بلا نص</Label>
        {pdfPreview.warnings.map((warning,index)=><Label key={index} p={p} size={13} color={p.muted}>{warning}</Label>)}
        {pdfPreview.body ? <Label p={p} size={14} numberOfLines={8}>{pdfPreview.body}</Label> : null}
        {pdfPreview.status === 'text' && <Button p={p} title="مراجعة مسودة PDF" disabled={busy} onPress={()=>onDraft({title:pdfPreview.title,body:pdfPreview.body})} />}
      </Panel>}
      {pdfRequest && PdfExtractor && <PdfExtractor request={pdfRequest}
        onProgress={progress=>{if(isCurrent(Number(pdfRequest.id)))setPdfProgress(`قراءة الصفحة ${progress.completed} من ${progress.total}`);}}
        onExtract={result=>{if(!isCurrent(Number(pdfRequest.id)))return;setPdfPreview(result);setPdfRequest(null);setPdfProgress('');setBusy(false);operationLock.current=false;}}
        onError={failure=>{if(!isCurrent(Number(pdfRequest.id)))return;setError(failure.message);setPdfRequest(null);setPdfProgress('');setBusy(false);operationLock.current=false;}} />}
    </>}
    {mode === 'media' && MediaPanel && <MediaPanel p={p} />}
    {busy && <View style={{gap:8}}><ActivityIndicator color={p.ink} /><Button p={p} title="إلغاء القراءة" tone="secondary" onPress={()=>{cancelRead();setMessage('أُلغيت القراءة. لم تُضف ملاحظة.');}} /></View>}
    <Label p={p} size={12} color={p.muted}>التبديل بين الأدوات يحتفظ بالحقول والمعاينات ما دمت في هذه الشاشة. أضف مسودة قبل مغادرتها للاحتفاظ بالنص.</Label>
  </View>;
}
