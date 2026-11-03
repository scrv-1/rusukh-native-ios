import React, { useMemo, useRef, useState } from 'react';
import { Alert, Linking, View } from 'react-native';
import { arabicRow, Button, Field, Label, Palette, Panel } from './ui';
import type { Note } from './types';
import type { LocalAIDraft, LocalAIStatus } from './ai/contracts';
import { boundSource, OFFICIAL_MODEL, studyResponseFormat, validateBridgeDraft } from './ai/contracts';
import { AISessionController, AISourceNote, useAIStudySession } from './ai/useAIStudySession';
import { studyChunks } from './studyChunks';
import { matchesSearch } from './sources';

type Props = {p:Palette; notes:Note[]; session?:AISessionController; onDraft:(value:{title:string;body:string;sourceNoteId?:string})=>void};
const line = (value:string) => value.replace(/[\r\n]+/g,' ').trim();
const modelDownloadUrl = `https://huggingface.co/${OFFICIAL_MODEL.repository}/resolve/${OFFICIAL_MODEL.revision}/${OFFICIAL_MODEL.name}?download=true`;

export function AIWorkspace({p,notes,onDraft,session}:Props) {
  const fallback = useAIStudySession(null, true);
  const study = session ?? fallback;
  const {sourceText = '', sourceTitle = 'نص مختار', sourceNote = null, result = null} = study.value ?? {};
  const selectedNote = sourceNote ? notes.find(note=>note.id===sourceNote.id && note.createdAt===sourceNote.createdAt && note.updatedAt===sourceNote.updatedAt) : undefined;
  const [chunkPage,setChunkPage] = useState(0);
  const chunks = useMemo(()=>selectedNote?studyChunks(selectedNote.body):[],[selectedNote]);
  const [query,setQuery] = useState('');
  const [notePage,setNotePage] = useState(0);
  const matchingNotes = useMemo(()=>notes.filter(n=>matchesSearch(n.title,n.body,query)),[notes,query]);
  const page = Math.min(notePage,Math.max(0,Math.ceil(matchingNotes.length/5)-1));
  const [running,setRunning] = useState(false);
  const [phase,setPhase] = useState<LocalAIStatus['phase']>('idle');
  const phaseNow = useRef(phase);
  const busy = phase==='loading' || phase==='generating';
  const [error,setError] = useState('');
  const [downloadError,setDownloadError] = useState('');
  const [modelSetup,setModelSetup] = useState<'file'|'reference'>('file');
  // Deliberately do not import the embedded WASM/HTML until the student opts in.
  const Engine = running ? require('./ai/LocalAILab').LocalAILab : null;
  function changeSource(text:string,title=sourceTitle,note:AISourceNote|null=null) {
    if (!study.editable || ['loading','generating'].includes(phaseNow.current)) return;
    if (text.length>1_000_000) {setError('المصدر يتجاوز مليون حرف. اختر مقطعًا أصغر؛ بقي النص السابق محفوظًا.');return;}
    const previous=study.getCurrent();
    const unchanged=previous?.sourceText===text && previous.sourceTitle===title && JSON.stringify(previous.sourceNote)===JSON.stringify(note);
    void study.update({version:1,sourceText:text,sourceTitle:title.slice(0,300),sourceNote:note,result:unchanged?previous.result:null});
    setError('');
  }
  function start() {
    if (!study.editable) return;
    try { studyResponseFormat(boundSource(sourceText)); }
    catch (failure) {setError(failure instanceof Error?failure.message:'تعذر التحقق من المصدر.');return;}
    setError('');setRunning(true);
  }
  function receiveDraft(draft:LocalAIDraft) {
    // The callback belongs to this exact source revision, including its original ID.
    if (!study.value || study.getCurrent()!==study.value) return;
    try { void study.update({...study.value,result:validateBridgeDraft(draft,sourceText)}); }
    catch { setError('لم تُقبل نتيجة لا تطابق المصدر الحالي.'); }
  }
  function receiveStatus(status:LocalAIStatus) {
    phaseNow.current=status.phase;setPhase(status.phase);
    // Releasing a model, a failed attempt or an interruption never erases a completed draft.
  }
  async function openModelDownload() {
    setDownloadError('');
    try { await Linking.openURL(modelDownloadUrl); }
    catch { setDownloadError('تعذّر فتح رابط النموذج. حاول مجددًا بعد التأكد من اتصال الإنترنت.'); }
  }
  function review() {
    if (!result) return;
    const body = `مسودة أسئلة مولدة محليًا — راجع صحتها قبل حفظ البطاقات.\nالمصدر: ${line(sourceTitle)}\nالنموذج: ${line(result.modelName)}\nالمحرك: ${result.engine}\n${sourceNote?`مرجع المصدر الأصلي: ${line(sourceNote.id)} (مراجعة ${sourceNote.updatedAt})\n`:''}\n`+
      result.questions.map(q=>`س: ${line(q.question)}\nج: ${line(q.answer)}\nالشاهد: «${line(q.evidence)}»`).join('\n\n')+
      '\n\nالنص الذي استُخدم:\n'+result.sourceText.split('\n').map(text=>'> '+text).join('\n');
    onDraft({title:`أسئلة — ${line(sourceTitle)}`.slice(0,150),body,...(selectedNote && selectedNote.body.includes(result.sourceText)?{sourceNoteId:selectedNote.id}:{})});
  }
  return <View style={{gap:16}}>
    <Label p={p} size={28} weight="800" role="header">مساعد الدراسة المحلي</Label>
    <Label p={p} color={p.muted}>حوّل مقطعًا قصيرًا إلى مسودة سؤال وإجابة على جهازك. تشغيل النموذج في Expo Go تجريبي، ويحتاج ملفًا محفوظًا؛ لم يُختبر على آيفونك بعد.</Label>
    {!running && <Panel p={p}>
      <Label p={p} weight="700" role="header">تجهيز النموذج</Label>
      <View style={{flexDirection:arabicRow,flexWrap:'wrap',gap:8}}>
        <Button p={p} title="لدي نموذج GGUF" tone={modelSetup==='file'?'primary':'secondary'} selected={modelSetup==='file'} onPress={()=>setModelSetup('file')} />
        <Button p={p} title="أحتاج النموذج المرجعي" tone={modelSetup==='reference'?'primary':'secondary'} selected={modelSetup==='reference'} onPress={()=>setModelSetup('reference')} />
      </View>
      {modelSetup==='file' ? <Label p={p} size={13} color={p.muted}>اختر المصدر أدناه وافتح المحرك، ثم اختر ملف النموذج. يمكنك تبديل ملف GGUF داخل المحرك؛ دعم الملفات الأخرى والعربية غير مضمون.</Label> : <>
        <Label p={p} size={14}>{OFFICIAL_MODEL.name}</Label>
        <Label p={p} size={13} color={p.muted}>النموذج الرسمي من Qwen · ترخيص {OFFICIAL_MODEL.license} · نحو 639 MB (610 MiB). التنزيل قد يستهلك باقة الإنترنت.</Label>
        <Label p={p} size={13} color={p.muted}>الملف غير مضمّن في التطبيق ولا يُنزّل تلقائيًا. احفظه من المتصفح في «على الـ iPhone»، ثم عد واختره من المحرك. وجود الملف في iCloud قد يتطلب تنزيله أولًا.</Label>
        <Button p={p} title="فتح تنزيل النموذج الرسمي" tone="secondary" onPress={()=>void openModelDownload()} />
        {!!downloadError && <Label p={p} color={p.danger} role="alert">{downloadError}</Label>}
      </>}
    </Panel>}
    <Panel p={p}>
      <Label p={p} weight="700" role="header">المصدر الذي تريد دراسته</Label>
      {study.loading && <Label p={p}>جارٍ استعادة جلسة المساعد…</Label>}
      {study.status==='error' && <><Label p={p} color={p.danger} role="alert">{study.editable?'تعذر حفظ جلسة المساعد. النص والنتيجة باقيان هنا؛ أعد محاولة الحفظ قبل إغلاق التطبيق.':'تعذر قراءة جلسة المساعد السابقة. لن نستبدلها حتى تنجح الاستعادة.'}</Label><Button p={p} title="إعادة محاولة حفظ أو استعادة جلسة المساعد" onPress={()=>void study.retry()} /></>}
      {!!session && study.hasPending && study.status!=='error' && <Label p={p} size={12} color={p.muted}>{study.status==='saving'?'جارٍ حفظ جلسة المساعد…':'مصدر المساعد ونتيجته محفوظان على هذا الجهاز، منفصلان عن ملاحظات الدراسة.'}</Label>}
      {busy && <Label p={p} color={p.muted}>أوقف العملية داخل المحرك قبل تغيير المصدر.</Label>
      }
      {sourceNote && !selectedNote && <Label p={p} color={p.muted}>تغيّرت الملاحظة الأصلية أو حُذفت. احتفظنا بنص جلستك كما هو؛ لن نربط النتيجة تلقائيًا بملاحظة أخرى.</Label>}
      {!sourceText.trim() && <Button p={p} title="تجربة بمثال قصير" tone="secondary" disabled={!study.editable || busy} onPress={()=>{setChunkPage(0);changeSource('المراجعة المتباعدة توزع جلسات التعلم على فترات زمنية. يساعد استرجاع المعلومة قبل كشف الإجابة على تدريب الذاكرة. ويمكن ربط الملاحظات المتشابهة لفهم العلاقة بين الأفكار.','مثال تجريبي');}} />}
      <Field p={p} label="البحث عن مصدر محفوظ" value={query} onChangeText={text=>{setQuery(text);setNotePage(0);}} />
      {matchingNotes.slice(page*5,(page+1)*5).map(n=><Button key={n.id} p={p} tone="secondary" disabled={!study.editable || busy} title={`استخدام: ${n.title}`} onPress={()=>{setChunkPage(0);changeSource(n.body,n.title,{id:n.id,createdAt:n.createdAt,updatedAt:n.updatedAt});}} />)}
      {matchingNotes.length===0 && <Label p={p} color={p.muted}>{query?'لا توجد مصادر تطابق بحثك.':'لا توجد ملاحظات محفوظة بعد؛ يمكنك لصق نص هنا.'}</Label>}
      {matchingNotes.length>5 && <><Label p={p} size={12} color={p.muted}>{matchingNotes.length} مصدر · صفحة {page+1} / {Math.ceil(matchingNotes.length/5)}</Label><View style={{flexDirection:arabicRow,gap:8}}><Button p={p} title="مصادر سابقة" tone="plain" disabled={page===0} onPress={()=>setNotePage(page-1)} /><Button p={p} title="مصادر تالية" tone="plain" disabled={(page+1)*5>=matchingNotes.length} onPress={()=>setNotePage(page+1)} /></View></>}
      <Label p={p} size={13} color={p.muted}>يمكنك أيضًا لصق مقطع من PDF أو تفريغ YouTube. يظل النص الكامل محفوظًا في ملاحظتك؛ اختر الجزء الذي تريد دراسته هنا.</Label>
      {selectedNote && selectedNote.body.length > 1600 && <View style={{gap:8}}>
        <Label p={p} weight="700">المصدر طويل. اختر مقطعًا واضحًا؛ لم نحذف بقية النص.</Label>
        {chunks.slice(chunkPage*8,(chunkPage+1)*8).map(chunk=><Button key={chunk.index} p={p} tone="secondary" disabled={!study.editable || busy} title={`المقطع ${chunk.index+1} — الحروف ${chunk.start+1} إلى ${chunk.end}`} onPress={()=>changeSource(chunk.text,`${selectedNote.title} — المقطع ${chunk.index+1} (${chunk.start+1}–${chunk.end})`,sourceNote)} />)}
        <Label p={p} size={12} color={p.muted}>{chunks.length} مقطع · صفحة {chunkPage+1} / {Math.ceil(chunks.length/8)}</Label>
        {chunkPage>0 && <Button p={p} title="مقاطع سابقة" tone="plain" onPress={()=>setChunkPage(n=>n-1)} />}
        {(chunkPage+1)*8<chunks.length && <Button p={p} title="مقاطع تالية" tone="plain" onPress={()=>setChunkPage(n=>n+1)} />}
      </View>}
      <Field p={p} label="النص المصدري للمساعد" value={sourceText} editable={study.editable && !busy} onChangeText={text=>changeSource(text,'نص مختار')} multiline />
      <Label p={p} size={12} color={p.muted}>{sourceText.trim().length} / 1600 حرف</Label>
      {!!error && <Label p={p} color={p.danger} role="alert">{error}</Label>}
      {!running && <Button p={p} title="فتح المحرك المحلي" disabled={!study.editable} onPress={start} />}
      {study.hasPending && <Button p={p} title="تجاهل جلسة المساعد" tone="plain" disabled={busy || !study.editable} onPress={()=>Alert.alert('تجاهل جلسة المساعد؟','سيُمسح النص والنتيجة المحفوظان للمساعد فقط. لن تتغير ملاحظاتك.',[{text:'إبقاء الجلسة',style:'cancel'},{text:'تجاهل الجلسة',style:'destructive',onPress:()=>{setRunning(false);phaseNow.current='idle';setPhase('idle');void study.clear();}}])} />}
    </Panel>
    {running && <Panel p={p}>
      <Label p={p} weight="700">المصدر: {sourceTitle}</Label>
      <Label p={p} size={12} color={p.muted}>تُفحص مطابقة الاقتباس حرفيًا؛ هذا لا يضمن صحة الاستنتاج. راجع الأسئلة بنفسك.</Label>
      <Engine p={p} sourceText={sourceText.trim()} onResult={receiveDraft} onStatus={receiveStatus} />
      <Button p={p} title="إغلاق المحرك وتحرير الذاكرة" tone="secondary" onPress={()=>{setRunning(false);phaseNow.current='idle';setPhase('idle');}} />
    </Panel>}
    {result && <Panel p={p}>
      <Label p={p} weight="700">مسودة تحتاج مراجعتك</Label>
      {result.questions.map((q,i)=><View key={i} style={{gap:6,borderBottomWidth:1,borderColor:p.border,paddingBottom:12}}>
        <Label p={p} weight="700">{q.question}</Label><Label p={p}>{q.answer}</Label>
        <Label p={p} color={p.muted} size={13}>الشاهد: {q.evidence}</Label>
      </View>)}
      <Button p={p} title="مراجعة الأسئلة في المحرر" onPress={review} />
      <Button p={p} title="تجاهل النتيجة" tone="plain" onPress={()=>{const current=study.getCurrent();if(current)void study.update({...current,result:null});}} />
    </Panel>}
  </View>;
}
