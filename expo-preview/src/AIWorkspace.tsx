import React, { useMemo, useState } from 'react';
import { Linking, View } from 'react-native';
import { arabicRow, Button, Field, Label, Palette, Panel } from './ui';
import type { Note } from './types';
import type { LocalAIDraft } from './ai/contracts';
import { OFFICIAL_MODEL } from './ai/contracts';
import { studyChunks } from './studyChunks';
import { matchesSearch } from './sources';

type Props = {p:Palette; notes:Note[]; onDraft:(value:{title:string;body:string})=>void};
const line = (value:string) => value.replace(/[\r\n]+/g,' ').trim();
const modelDownloadUrl = `https://huggingface.co/${OFFICIAL_MODEL.repository}/resolve/${OFFICIAL_MODEL.revision}/${OFFICIAL_MODEL.name}?download=true`;

export function AIWorkspace({p,notes,onDraft}:Props) {
  const [sourceText,setSourceText] = useState('');
  const [sourceTitle,setSourceTitle] = useState('نص مختار');
  const [selectedNote,setSelectedNote] = useState<Note|null>(null);
  const [chunkPage,setChunkPage] = useState(0);
  const chunks = useMemo(()=>selectedNote?studyChunks(selectedNote.body):[],[selectedNote]);
  const [query,setQuery] = useState('');
  const [running,setRunning] = useState(false);
  const [result,setResult] = useState<LocalAIDraft|null>(null);
  const [error,setError] = useState('');
  const [downloadError,setDownloadError] = useState('');
  const [modelSetup,setModelSetup] = useState<'file'|'reference'>('file');
  // Deliberately do not import the embedded WASM/HTML until the student opts in.
  const Engine = running ? require('./ai/LocalAILab').LocalAILab : null;
  function changeSource(text:string,title=sourceTitle) { setSourceText(text);setSourceTitle(title);setResult(null);setError(''); }
  function start() {
    if (sourceText.trim().length < 30 || sourceText.trim().length > 1600) {
      setError('اختر مقطعًا بين 30 و1600 حرف. لن نختصر مصدرَك دون علمك.'); return;
    }
    setError('');setRunning(true);setResult(null);
  }
  async function openModelDownload() {
    setDownloadError('');
    try { await Linking.openURL(modelDownloadUrl); }
    catch { setDownloadError('تعذّر فتح رابط النموذج. حاول مجددًا بعد التأكد من اتصال الإنترنت.'); }
  }
  function review() {
    if (!result) return;
    const body = `مسودة أسئلة مولدة محليًا — راجع صحتها قبل حفظ البطاقات.\nالمصدر: ${line(sourceTitle)}\nالنموذج: ${line(result.modelName)}\n\n`+
      result.questions.map(q=>`س: ${line(q.question)}\nج: ${line(q.answer)}\nالشاهد: «${line(q.evidence)}»`).join('\n\n')+
      '\n\nالنص الذي استُخدم:\n'+result.sourceText.split('\n').map(text=>'> '+text).join('\n');
    onDraft({title:`أسئلة — ${line(sourceTitle)}`.slice(0,150),body});
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
    {!running && <Panel p={p}>
      <Label p={p} weight="700" role="header">المصدر الذي تريد دراسته</Label>
      {!sourceText.trim() && <Button p={p} title="تجربة بمثال قصير" tone="secondary" onPress={()=>{setSelectedNote(null);setChunkPage(0);changeSource('المراجعة المتباعدة توزع جلسات التعلم على فترات زمنية. يساعد استرجاع المعلومة قبل كشف الإجابة على تدريب الذاكرة. ويمكن ربط الملاحظات المتشابهة لفهم العلاقة بين الأفكار.','مثال تجريبي');}} />}
      <Field p={p} label="البحث عن مصدر محفوظ" value={query} onChangeText={setQuery} />
      {notes.filter(n=>matchesSearch(n.title,n.body,query)).slice(0,5).map(n=><Button key={n.id} p={p} tone="secondary" title={`استخدام: ${n.title}`} onPress={()=>{setSelectedNote(n);setChunkPage(0);changeSource(n.body,n.title);}} />)}
      <Label p={p} size={13} color={p.muted}>يمكنك أيضًا لصق مقطع من PDF أو تفريغ YouTube. يظل النص الكامل محفوظًا في ملاحظتك؛ اختر الجزء الذي تريد دراسته هنا.</Label>
      {selectedNote && selectedNote.body.length > 1600 && <View style={{gap:8}}>
        <Label p={p} weight="700">المصدر طويل. اختر مقطعًا واضحًا؛ لم نحذف بقية النص.</Label>
        {chunks.slice(chunkPage*8,(chunkPage+1)*8).map(chunk=><Button key={chunk.index} p={p} tone="secondary" title={`المقطع ${chunk.index+1} — الحروف ${chunk.start+1} إلى ${chunk.end}`} onPress={()=>changeSource(chunk.text,`${selectedNote.title} — المقطع ${chunk.index+1} (${chunk.start+1}–${chunk.end})`)} />)}
        <Label p={p} size={12} color={p.muted}>{chunks.length} مقطع · صفحة {chunkPage+1} / {Math.ceil(chunks.length/8)}</Label>
        {chunkPage>0 && <Button p={p} title="مقاطع سابقة" tone="plain" onPress={()=>setChunkPage(n=>n-1)} />}
        {(chunkPage+1)*8<chunks.length && <Button p={p} title="مقاطع تالية" tone="plain" onPress={()=>setChunkPage(n=>n+1)} />}
      </View>}
      <Field p={p} label="النص المصدري للمساعد" value={sourceText} onChangeText={text=>changeSource(text,'نص مختار')} multiline />
      <Label p={p} size={12} color={p.muted}>{sourceText.trim().length} / 1600 حرف</Label>
      {!!error && <Label p={p} color={p.danger} role="alert">{error}</Label>}
      <Button p={p} title="فتح المحرك المحلي" onPress={start} />
    </Panel>}
    {running && <Panel p={p}>
      <Label p={p} weight="700">المصدر: {sourceTitle}</Label>
      <Label p={p} size={12} color={p.muted}>تُفحص مطابقة الاقتباس حرفيًا؛ هذا لا يضمن صحة الاستنتاج. راجع الأسئلة بنفسك.</Label>
      <Engine sourceText={sourceText.trim()} onResult={(draft:LocalAIDraft)=>setResult(draft)} onStatus={(status:{phase:string})=>{if(['generating','error','cancelled'].includes(status.phase))setResult(null);}} />
      <Button p={p} title="إغلاق المحرك وتحرير الذاكرة" tone="secondary" onPress={()=>setRunning(false)} />
    </Panel>}
    {result && <Panel p={p}>
      <Label p={p} weight="700">مسودة تحتاج مراجعتك</Label>
      {result.questions.map((q,i)=><View key={i} style={{gap:6,borderBottomWidth:1,borderColor:p.border,paddingBottom:12}}>
        <Label p={p} weight="700">{q.question}</Label><Label p={p}>{q.answer}</Label>
        <Label p={p} color={p.muted} size={13}>الشاهد: {q.evidence}</Label>
      </View>)}
      <Button p={p} title="مراجعة الأسئلة في المحرر" onPress={review} />
      <Button p={p} title="تجاهل النتيجة" tone="plain" onPress={()=>setResult(null)} />
    </Panel>}
  </View>;
}
