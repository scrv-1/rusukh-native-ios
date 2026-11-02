import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, AppState, KeyboardAvoidingView, Modal, Platform, Pressable,
  ScrollView, StatusBar, TextInput, View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import { Button, Empty, Field, Icon, Label, Panel, Palette, dark, light } from './src/ui';
import { KnowledgeGraph } from './src/KnowledgeGraph';
import { WorkspaceEditor } from './src/WorkspaceEditor';
import { defaultWorkspace, MODULES, ModuleId, pinnedModules, readWorkspace, Workspace, WORKSPACE_KEY } from './src/workspace';
import { markdownNote, matchesSearch, MAX_NOTE_CHARS, MAX_SOURCE_BYTES, prepareSource } from './src/sources';
import { dueCards, graphEdges, makeId, makeQuiz, normalizeTitle, parseQuestionAnswer, validateBackup } from './src/core';
import type { Backup, Note, StudyCard, ReviewEvent, Grade } from './src/types';
import {
  Database, deleteCard, deleteNote, getSetting, makeBackup, openStorage,
  readAll, recordReview, restoreBackup, saveCard, saveNoteAndCards, setSetting,
} from './src/storage';

type Tab = 'home' | 'notes' | 'review' | 'graph' | 'settings' | 'sources' | 'tools';
const TABS: { id: Tab; label: string; symbol: string }[] = [
  { id: 'home', label: 'الرئيسية', symbol: 'house.fill' },
  { id: 'notes', label: 'الملاحظات', symbol: 'note.text' },
  { id: 'review', label: 'المراجعة', symbol: 'rectangle.stack.fill' },
  { id: 'graph', label: 'الشبكة', symbol: 'point.3.connected.trianglepath.dotted' },
  { id: 'settings', label: 'الإعدادات', symbol: 'gearshape.fill' },
];
const screenTitle: Record<Tab, string> = {
  home: 'رُسوخ', notes: 'ملاحظاتي', review: 'المراجعة', graph: 'شبكة أفكاري', settings: 'الإعدادات', sources: 'مصادري', tools: 'كل الأدوات',
};

function AppContent() {
  const [db, setDb] = useState<Database | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [cards, setCards] = useState<StudyCard[]>([]);
  const [reviews, setReviews] = useState<ReviewEvent[]>([]);
  const [tab, setTab] = useState<Tab>('home');
  const [isDark, setIsDark] = useState(false);
  const [busy, setBusy] = useState(true);
  const [search, setSearch] = useState('');
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftBody, setDraftBody] = useState('');
  const [cardEditorNoteId, setCardEditorNoteId] = useState<string | null>(null);
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [revealed, setRevealed] = useState(false);
  const [quizData, setQuizData] = useState<ReturnType<typeof makeQuiz>>([]);
  const [quizIndex, setQuizIndex] = useState(0);
  const [quizSelected, setQuizSelected] = useState<string | null>(null);
  const [quizScore, setQuizScore] = useState(0);
  const [quizOpen, setQuizOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const actionLock = useRef(false);
  const preferenceLock = useRef(false);
  const [workspace, setWorkspace] = useState<Workspace>(defaultWorkspace);
  const [customizing, setCustomizing] = useState(false);
  const [clock, setClock] = useState(Date.now);
  const visibleTabs = [TABS[0], ...pinnedModules(workspace).map(id => {
    const module = MODULES.find(m => m.id === id)!;
    return { id: id as Tab, label: module.title, symbol: module.symbol };
  }), TABS[4]];
  const p = isDark ? dark : light;
  const due = useMemo(() => dueCards(cards, clock), [cards, clock]);
  const links = useMemo(() => graphEdges(notes), [notes]);
  const today = new Date(clock).toDateString();
  const todayReviewed = reviews.filter(r => new Date(r.reviewedAt).toDateString() === today).length;

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const opened = await openStorage();
        if (!active) return;
        const [data, mode, layout] = await Promise.all([readAll(opened), getSetting(opened, 'darkMode'), getSetting(opened, WORKSPACE_KEY)]);
        if (!active) return;
        setClock(Date.now()); setDb(opened); setNotes(data.notes); setCards(data.cards); setReviews(data.reviews);
        setIsDark(mode === 'true'); setWorkspace(readWorkspace(layout));
      } catch (err) {
        Alert.alert('خطأ في فتح قاعدة البيانات', String(err));
      } finally { if (active) setBusy(false); }
    })();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now()), 30000);
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') setClock(Date.now()); });
    return () => { clearInterval(timer); subscription.remove(); };
  }, []);

  async function saveWorkspace(next: Workspace): Promise<boolean> {
    if (!db || preferenceLock.current) return false;
    preferenceLock.current = true;
    try {
      await setSetting(db, WORKSPACE_KEY, JSON.stringify(next));
      setWorkspace(next); setCustomizing(false);
      return true;
    } catch {
      Alert.alert('لم يُحفظ الترتيب', 'اختياراتك ما زالت هنا. حاول الحفظ مرة أخرى.');
      return false;
    } finally { preferenceLock.current = false; }
  }

  function openModule(id: ModuleId) {
    if (id === 'quiz') startQuiz();
    else { setRevealed(false); setTab(id); }
  }

  async function importSource() {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
      if (result.canceled || !result.assets[0]) return;
      const asset = result.assets[0];
      const file = new File(asset.uri);
      if (Math.max(asset.size ?? 0, file.size ?? 0) > MAX_SOURCE_BYTES) throw new Error('الحد الأقصى للملف 1 ميغابايت.');
      const draft = prepareSource(asset.name, await file.text());
      setEditingId(null); setDraftTitle(draft.title); setDraftBody(draft.body); setEditorOpen(true);
    } catch (error) { Alert.alert('تعذّر قراءة المصدر', String(error)); }
  }

  async function exportMarkdown() {
    try {
      const file = new File(Paths.cache, `rusukh-note-${Date.now()}.md`);
      file.create(); await file.write(markdownNote(draftTitle, draftBody));
      if (!(await Sharing.isAvailableAsync())) throw new Error('المشاركة غير متوفرة');
      await Sharing.shareAsync(file.uri, { mimeType: 'text/markdown', UTI: 'public.plain-text' });
    } catch (error) { Alert.alert('تعذّر تصدير الملاحظة', String(error)); }
  }

  async function refresh(d: Database) {
    const data = await readAll(d);
    setClock(Date.now()); setNotes(data.notes); setCards(data.cards); setReviews(data.reviews);
  }
  async function action(fn: (d: Database) => Promise<void>): Promise<boolean> {
    if (!db || actionLock.current) return false;
    actionLock.current = true; setSaving(true);
    try { await fn(db); await refresh(db); return true; }
    catch (error) { Alert.alert('تعذّر إكمال العملية', String(error)); return false; }
    finally { actionLock.current = false; setSaving(false); }
  }
  function openNew() {
    setEditingId(null); setDraftTitle(''); setDraftBody(''); setEditorOpen(true);
  }
  function openNote(note: Note) {
    setEditingId(note.id); setDraftTitle(note.title); setDraftBody(note.body); setEditorOpen(true);
  }
  async function commitNote(autoCards = false) {
    const name = draftTitle.trim();
    if (!name) { Alert.alert('عنوان مطلوب', 'اكتب عنوان الملاحظة أولًا.'); return; }
    if (notes.some(n => n.id !== editingId && normalizeTitle(n.title) === normalizeTitle(name))) {
      Alert.alert('العنوان مكرر', 'اختر عنوانًا مختلفًا حتى تظل الروابط بين الملاحظات دقيقة.'); return;
    }
    if (draftBody.length > MAX_NOTE_CHARS || name.length > 160) {
      Alert.alert('النص طويل جدًا', 'الحد الأقصى مليون حرف للمحتوى و160 حرفًا للعنوان.'); return;
    }
    const now = Date.now();
    const original = notes.find(n => n.id === editingId);
    const note: Note = { id: editingId ?? makeId('note'), title: name, body: draftBody,
      createdAt: original?.createdAt ?? now, updatedAt: now };
    const pairs = autoCards ? parseQuestionAnswer(draftBody) : [];
    const existing = new Set(cards.filter(c => c.noteId === note.id).map(c => normalizeTitle(c.question)));
    const additions: StudyCard[] = [];
    for (const pair of pairs) {
      const normalized = normalizeTitle(pair.question);
      if (existing.has(normalized)) continue;
      additions.push({ id: makeId('card'), noteId: note.id, question: pair.question,
        answer: pair.answer, dueAt: now, intervalDays: 0, ease: 2.5, repetitions: 0, updatedAt: now });
      existing.add(normalized);
    }
    const created = additions.length;
    const saved = await action(d => saveNoteAndCards(d, note, additions));
    if (!saved) return;
    setEditorOpen(false);
    if (autoCards) Alert.alert('البطاقات', created > 0 ? `أُنشئت ${created} بطاقة من أسطر س: وج:.` : 'لم أجد أسئلة جديدة بصيغة س: وج:.');
  }
  function confirmDelete(note: Note) {
    Alert.alert('حذف الملاحظة؟', 'ستُحذف أيضًا بطاقاتها وسجل مراجعاتها، ولا يمكن التراجع.', [
      { text: 'إلغاء', style: 'cancel' },
      { text: 'حذف', style: 'destructive', onPress: () => void action(async d => {
        await deleteNote(d, note.id); setEditorOpen(false);
      }) },
    ]);
  }
  function openCardEditor(noteId: string) {
    setCardEditorNoteId(noteId); setQuestion(''); setAnswer(''); setEditorOpen(false);
  }
  async function commitCard() {
    if (!cardEditorNoteId || !question.trim() || !answer.trim()) {
      Alert.alert('بيانات ناقصة', 'أدخل السؤال والإجابة.'); return;
    }
    if (cards.some(c => c.noteId === cardEditorNoteId && normalizeTitle(c.question) === normalizeTitle(question))) {
      Alert.alert('بطاقة مكررة', 'هذا السؤال موجود في الملاحظة.'); return;
    }
    const now = Date.now();
    const saved = await action(async d => saveCard(d, { id: makeId('card'), noteId: cardEditorNoteId,
      question: question.trim(), answer: answer.trim(), dueAt: now, intervalDays: 0,
      ease: 2.5, repetitions: 0, updatedAt: now }));
    if (saved) setCardEditorNoteId(null);
  }
  function confirmCardDelete(card: StudyCard) {
    Alert.alert('حذف البطاقة؟', 'سيحذف سجل مراجعاتها أيضًا.', [
      { text: 'إلغاء', style: 'cancel' },
      { text: 'حذف', style: 'destructive', onPress: () => void action(d => deleteCard(d, card.id)) },
    ]);
  }
  async function review(card: StudyCard, grade: Grade) {
    await action(d => recordReview(d, card, grade));
    setRevealed(false);
  }
  function startQuiz() {
    const questions = makeQuiz(cards, 8);
    if (!questions.length) {
      Alert.alert('بطاقات غير كافية', 'أنشئ بطاقتين بإجابتين مختلفتين على الأقل.'); return;
    }
    setQuizData(questions); setQuizIndex(0); setQuizScore(0); setQuizSelected(null); setQuizOpen(true);
  }
  async function exportData() {
    try {
      const file = new File(Paths.cache, `rusukh-backup-${Date.now()}.json`);
      file.create();
      await file.write(JSON.stringify(makeBackup(notes, cards, reviews), null, 2));
      if (!(await Sharing.isAvailableAsync())) throw new Error('المشاركة غير متوفرة على الجهاز');
      await Sharing.shareAsync(file.uri, { mimeType: 'application/json', UTI: 'public.json' });
    } catch (error) { Alert.alert('تعذّر تصدير النسخة', String(error)); }
  }
  async function importData() {
    if (!db) return;
    try {
      const picked = await DocumentPicker.getDocumentAsync({ type: 'application/json', copyToCacheDirectory: true });
      if (picked.canceled || !picked.assets[0]) return;
      const file = new File(picked.assets[0].uri);
      if (file.size && file.size > 15 * 1024 * 1024) throw new Error('الملف أكبر من 15 ميغابايت');
      const parsed: unknown = JSON.parse(await file.text());
      if (!validateBackup(parsed)) throw new Error('النسخة غير صالحة أو ليست من رُسوخ');
      const backup = parsed as Backup;
      Alert.alert('استبدال البيانات الحالية؟',
        `سيتم استبدال ${notes.length} ملاحظة بـ ${backup.notes.length} ملاحظة. احفظ نسخة احتياطية أولًا.`, [
          { text: 'إلغاء', style: 'cancel' },
          { text: 'استبدال', style: 'destructive', onPress: () => void action(d => restoreBackup(d, backup)) },
        ]);
    } catch (error) { Alert.alert('تعذّر استيراد النسخة', String(error)); }
  }
  async function toggleDark() {
    const next = !isDark;
    if (db) {
      try { await setSetting(db, 'darkMode', String(next)); setIsDark(next); }
      catch (err) { Alert.alert('لم يُحفظ المظهر', String(err)); }
    }
  }

  function header(title: string, detail?: string) {
    return <View style={{ gap: 5, marginBottom: 17 }}>
      <Label p={p} size={30} weight="800">{title}</Label>
      {detail ? <Label p={p} size={13} color={p.muted}>{detail}</Label> : null}
    </View>;
  }
  function stat(value: number, title: string) {
    return <Panel p={p} style={{ flex: 1, padding: 14, gap: 3 }}>
      <Label p={p} size={28} weight="800">{value}</Label>
      <Label p={p} size={11} color={p.muted}>{title}</Label>
    </Panel>;
  }
  function noteTile(note: Note, compact = false) {
    const cardCount = cards.filter(c => c.noteId === note.id).length;
    return <Panel key={note.id} p={p} style={{ padding: 16, gap: 11 }}>
      <Pressable onPress={() => openNote(note)} accessibilityRole="button" accessibilityLabel={`فتح ${note.title}`}>
        <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', gap: 10 }}>
          <View style={{ flex: 1, gap: 5 }}>
            <Label p={p} size={16} weight="700" numberOfLines={1}>{note.title}</Label>
            <Label p={p} size={12} color={p.muted} numberOfLines={compact ? 1 : 2}>
              {note.body.replace(/\[\[|\]\]/g, '') || 'ملاحظة فارغة'}</Label>
          </View>
          <Icon name="chevron.left" size={16} p={p} color={p.muted} />
        </View>
      </Pressable>
      <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' }}>
        <Label p={p} size={12} color={p.muted}>{cardCount} بطاقة</Label>
        <Button title="بطاقة جديدة" tone="secondary" compact p={p} onPress={() => openCardEditor(note.id)} icon="plus" />
      </View>
    </Panel>;
  }

  function homeScreen() {
    const shown = workspace.modules.filter(m => m.enabled);
    const compact = workspace.density === 'compact';
    return <View style={{ gap: 16 }}>
      {header('مساحتي', 'تعلّم يبقى. وأدوات تختارها أنت.')}
      <View style={{ flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 8 }}>
        <Button title="تخصيص مساحتي" p={p} tone="secondary" icon="slider.horizontal.3" onPress={() => setCustomizing(true)} />
        <Button title="كل الأدوات" p={p} tone="plain" onPress={() => setTab('tools')} />
      </View>
      <Label p={p} size={13} color={p.muted}>{notes.length} ملاحظة · {cards.length} بطاقة · {todayReviewed} مراجعة اليوم</Label>
      {shown.length === 0 && <Panel p={p}>
        <Empty p={p} title="مساحة هادئة على ذوقك" detail="بياناتك محفوظة. أضف أداة أو افتحها من كل الأدوات." />
        <Button p={p} title="إضافة أدوات لمساحتي" onPress={() => setCustomizing(true)} />
      </Panel>}
      {shown.map(item => {
        const module = MODULES.find(m => m.id === item.id)!;
        return <Panel key={item.id} p={p} style={{ padding: compact ? 15 : 20, gap: 12 }}>
          <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 10 }}>
            <Icon name={module.symbol} p={p} />
            <View style={{ flex: 1 }}><Label p={p} size={18} weight="800">{module.title}</Label></View>
          </View>
          <Label p={p} color={p.muted} size={13}>{item.id === 'review' ? `${due.length} بطاقة مستحقة الآن` : item.id === 'graph' ? `${links.length} علاقة بين أفكارك` : module.detail}</Label>
          {!compact && item.id === 'notes' && notes.slice(0, 2).map(note =>
            <Pressable key={note.id} accessibilityRole="button" accessibilityLabel={`فتح ${note.title}`} onPress={() => openNote(note)}
              style={{ minHeight: 44, justifyContent: 'center', borderBottomWidth: 1, borderColor: p.border }}>
              <Label p={p} numberOfLines={1}>{note.title}</Label>
            </Pressable>)}
          <Button p={p} title={item.id === 'review' ? 'ابدأ المراجعة' : item.id === 'quiz' ? 'ابدأ الاختبار' : `فتح ${module.title}`}
            tone={item.id === 'review' ? 'primary' : 'secondary'} onPress={() => openModule(item.id)} />
        </Panel>;
      })}
      <Button p={p} title="ملاحظة جديدة" tone="secondary" icon="square.and.pencil" onPress={openNew} />
    </View>;
  }

  function toolsScreen() {
    return <View style={{ gap: 14 }}>
      {header('كل الأدوات', 'تظل أدواتك هنا حتى لو أخفيتها من الرئيسية')}
      {MODULES.map(module => <Panel key={module.id} p={p}>
        <Label p={p} size={18} weight="700">{module.title}</Label>
        <Label p={p} size={13} color={p.muted}>{module.detail}</Label>
        <Button p={p} title={`فتح ${module.title}`} tone="secondary" onPress={() => openModule(module.id)} />
      </Panel>)}
      <Button p={p} title="تخصيص مساحتي" onPress={() => setCustomizing(true)} />
    </View>;
  }

  function sourcesScreen() {
    return <View style={{ gap: 16 }}>
      {header('مصادري', 'من الملفات إلى ملاحظاتك، دون رفع المحتوى إلى خادم')}
      <Panel p={p}>
        <Label p={p} size={19} weight="700">أضف نصًا أو تفريغ محاضرة</Label>
        <Label p={p} color={p.muted} size={14}>استورد TXT أو Markdown أو ترجمة SRT / VTT حتى 1 ميغابايت بترميز UTF-8. ستراجع النص قبل حفظه كملاحظة جديدة.</Label>
        <Button p={p} title="اختيار مصدر من الملفات" icon="square.and.arrow.down" onPress={() => void importSource()} />
      </Panel>
      <Panel p={p}>
        <Label p={p} weight="700">من محاضرة إلى بطاقات</Label>
        <Label p={p} size={14}>استورد ملف تفريغ تملكه أو يتيحه صاحب المقطع. احتفظ بتوقيتاته، ثم أضف أسئلتك بصيغة س: وج: واضغط «حفظ واستخراج بطاقات».</Label>
        <Label p={p} size={13} color={p.muted}>هذه قراءة نصوص واستخراج أسئلة مكتوبة، وليست توليدًا بالذكاء الاصطناعي. جلب روابط YouTube وقراءة PDF تلقائيًا غير متاحين في هذه النسخة.</Label>
      </Panel>
      <Button p={p} title="عرض الملاحظات المحفوظة" tone="secondary" onPress={() => setTab('notes')} />
    </View>;
  }
  function notesScreen() {
    const filtered = notes.filter(n => matchesSearch(n.title, n.body, search));
    return <View style={{ gap: 14 }}>
      {header('ملاحظاتي', `${notes.length} ملاحظة محفوظة على جهازك`)}
      <View style={{ flexDirection: 'row-reverse', gap: 9 }}>
        <TextInput value={search} onChangeText={setSearch} placeholder="ابحث في الملاحظات..."
          placeholderTextColor={p.muted} textAlign="right" accessibilityLabel="البحث في الملاحظات"
          style={{ flex: 1, color: p.ink, backgroundColor: p.surface, borderRadius: 15, paddingHorizontal: 14,
            borderWidth: 1, borderColor: p.border, minHeight: 48 }} />
        <Button p={p} title="+ جديد" compact onPress={openNew} />
      </View>
      {filtered.map(n => noteTile(n))}
      {!filtered.length && <Empty p={p} title="لا توجد نتائج" detail="جرّب عبارة أخرى أو أضف ملاحظة" />}
    </View>;
  }
  function reviewScreen() {
    const current = due[0];
    return <View style={{ gap: 16 }}>
      {header('المراجعة', 'تذكّر الإجابة أولًا، ثم قيّم سهولتها')}
      <View style={{ flexDirection: 'row-reverse', gap: 10 }}>
        {stat(due.length, 'مستحقة الآن')}{stat(todayReviewed, 'مُراجعة اليوم')}
      </View>
      {current ? <Panel p={p} style={{ minHeight: 290, padding: 22, justifyContent: 'space-between' }}>
        <Label p={p} size={12} color={p.muted}>{notes.find(n => n.id === current.noteId)?.title ?? 'بطاقة'}</Label>
        <Label p={p} size={23} weight="700" style={{ marginVertical: 17 }}>{current.question}</Label>
        {revealed ? <View style={{ gap: 12 }}>
          <View style={{ backgroundColor: p.subtle, padding: 17, borderRadius: 15 }}>
            <Label p={p} size={17}>{current.answer}</Label>
          </View>
          <Label p={p} size={12} color={p.muted}>اختر تقييمًا لتحديد موعد المراجعة القادمة.</Label>
          <View style={{ flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 7 }}>
            {([['again','مُجددًا'],['hard','صعب'],['good','جيد'],['easy','سهل']] as [Grade,string][]).map(([grade,label]) =>
              <Button key={grade} p={p} title={label} tone={grade === 'good' ? 'primary' : 'secondary'}
                compact disabled={saving} onPress={() => void review(current,grade)} style={{ flexGrow: 1 }} />)}
          </View>
        </View> : <Button title="إظهار الإجابة" p={p} onPress={() => setRevealed(true)} />}
      </Panel> : <Panel p={p}><Empty p={p} title="لا توجد بطاقات مستحقة الآن" detail="يمكنك إضافة بطاقات أو إجراء اختبار سريع" /></Panel>}
      <Button title="اختبار اختيارات" p={p} tone="secondary" icon="checkmark.circle" onPress={startQuiz} />
      <Label p={p} size={17} weight="800">كل البطاقات ({cards.length})</Label>
      {cards.map(c => <Panel key={c.id} p={p} style={{ padding: 14, gap: 8 }}>
        <Label p={p} size={14} weight="700">{c.question}</Label>
        <Label p={p} size={13} color={p.muted}>{c.answer}</Label>
        <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' }}>
          <Label p={p} size={11} color={p.muted}>{c.dueAt <= Date.now() ? 'مستحقة الآن' : `قادمة: ${new Date(c.dueAt).toLocaleDateString('ar-SA')}`}</Label>
          <Button title="حذف" p={p} compact tone="danger" onPress={() => confirmCardDelete(c)} />
        </View>
      </Panel>)}
    </View>;
  }
  function graphScreen() { return <View style={{ gap: 15 }}>
    {header('شبكة أفكاري', `${notes.length} عقدة · ${links.length} علاقة`)}
    <KnowledgeGraph notes={notes} p={p} onOpen={openNote} />
  </View>; }
  function settingsScreen() { return <View style={{ gap: 15 }}>
    {header('الإعدادات', 'حفظ محلي، دون خادم أو حساب مطلوب')}
    <Panel p={p}><Label p={p} weight="700">مساحتك كما تحب</Label>
      <Button p={p} title="تخصيص مساحتي" tone="secondary" onPress={() => setCustomizing(true)} />
      <Label p={p} size={12} color={p.muted}>اختيارات الواجهة محفوظة على هذا الجهاز، منفصلة عن نسخة محتوى الدراسة.</Label>
    </Panel>
    <Panel p={p}>
      <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' }}>
        <Label p={p} size={16} weight="700">المظهر {isDark ? 'الداكن' : 'الفاتح'}</Label>
        <Button title={isDark ? 'فاتح' : 'داكن'} p={p} tone="secondary" onPress={() => void toggleDark()} />
      </View>
    </Panel>
    <Panel p={p}>
      <Label p={p} size={17} weight="700">النسخ الاحتياطي</Label>
      <Label p={p} size={13} color={p.muted}>صدّر ملف JSON إلى تطبيق الملفات. الاستيراد يستبدل المحتوى الحالي بعد التأكيد.</Label>
      <Button p={p} title="تصدير نسخة إلى الملفات" icon="square.and.arrow.up" onPress={() => void exportData()} />
      <Button p={p} title="استيراد نسخة من الملفات" tone="secondary" icon="square.and.arrow.down" onPress={() => void importData()} />
    </Panel>
    <Panel p={p}>
      <Label p={p} weight="700">عن النسخة</Label>
      <Label p={p} size={13} color={p.muted}>رُسوخ 0.2 — مساحة قابلة للتخصيص واستيراد نصوص. جدولة المراجعة مبسطة وليست FSRS. شبكة العلاقات تعتمد على الروابط [[العنوان]]، ولا يوجد اتصال ذكاء اصطناعي أو مزامنة سحابية بعد.</Label>
    </Panel>
  </View>; }
  function modalHeader(title: string, close: () => void) {
    return <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 14 }}>
      <Label p={p} size={21} weight="800">{title}</Label>
      <Button p={p} title="إغلاق" tone="secondary" compact onPress={close} />
    </View>;
  }

  if (busy) return <SafeAreaView style={{ flex: 1, backgroundColor: p.bg, justifyContent: 'center', alignItems: 'center', gap: 12 }}>
    <ActivityIndicator color={p.ink} /><Label p={p}>جاري فتح رُسوخ…</Label>
  </SafeAreaView>;
  if (!db) return <SafeAreaView style={{ flex: 1, justifyContent: 'center', padding: 30, backgroundColor: p.bg }}>
    <Empty p={p} title="تعذّر تشغيل رُسوخ" detail="راجع رسالة الخطأ ثم أعد تشغيل التطبيق" />
  </SafeAreaView>;
  return <SafeAreaView style={{ flex: 1, backgroundColor: p.bg }}>
    <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
    <View style={{ paddingHorizontal: 22, height: 56, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between' }}>
      <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 9 }}>
        <View style={{ backgroundColor: p.accent, width: 33, height: 33, borderRadius: 10, justifyContent: 'center', alignItems: 'center' }}>
          <Label p={p} size={22} color={p.accentInk} weight="800">ر</Label>
        </View>
        <Label p={p} size={16} weight="800">{screenTitle[tab]}</Label>
      </View>
      <Pressable onPress={() => setTab('tools')} accessibilityRole="button" accessibilityLabel="كل الأدوات"
        style={{ width: 44, height: 44, borderRadius: 15, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="square.grid.2x2" p={p} size={22} />
      </Pressable>
    </View>
    <ScrollView key={tab} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 14, paddingBottom: 32, gap: 2 }}>
      {tab === 'home' ? homeScreen() : tab === 'notes' ? notesScreen() : tab === 'review' ? reviewScreen() : tab === 'graph' ? graphScreen() : tab === 'sources' ? sourcesScreen() : tab === 'tools' ? toolsScreen() : settingsScreen()}
    </ScrollView>
    <View style={{ flexDirection: 'row-reverse', borderTopWidth: 1, borderColor: p.border, backgroundColor: p.surface, paddingTop: 8, paddingBottom: 6 }}>
      {visibleTabs.map(t => <Pressable key={t.id} accessibilityRole="tab" accessibilityState={{ selected: tab === t.id }}
        accessibilityLabel={t.label} onPress={() => { setTab(t.id); setRevealed(false); }}
        style={{ flex: 1, minHeight: 57, alignItems: 'center', justifyContent: 'center', gap: 3, opacity: tab === t.id ? 1 : .55 }}>
        <Icon name={t.symbol} p={p} size={22} />
        <Label p={p} size={10} weight={tab === t.id ? '700' : '400'}>{t.label}</Label>
      </Pressable>)}
    </View>

    {customizing && <WorkspaceEditor value={workspace} p={p} onCancel={() => setCustomizing(false)} onSave={saveWorkspace} />}

    <Modal visible={editorOpen} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setEditorOpen(false)}>
      <SafeAreaView style={{ flex: 1, backgroundColor: p.bg }}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 20, gap: 17 }}>
            {modalHeader(editingId ? 'تعديل الملاحظة' : 'ملاحظة جديدة', () => setEditorOpen(false))}
            <Field p={p} label="العنوان" value={draftTitle} onChangeText={setDraftTitle} placeholder="عنوان الملاحظة" />
            <Field p={p} label="المحتوى" multiline numberOfLines={12} value={draftBody} onChangeText={setDraftBody}
              placeholder="اكتب هنا… للربط استخدم [[عنوان ملاحظة]]" />
            <Label p={p} size={12} color={p.muted}>توليد بطاقات من نصك: اكتب سؤالًا في س: والإجابة في ج: على سطر منفصل.</Label>
            <Button p={p} title="تصدير النص إلى الملفات (Markdown)" tone="plain" onPress={() => void exportMarkdown()} />
            <Button p={p} title="حفظ الملاحظة" onPress={() => void commitNote()} disabled={saving} />
            <Button p={p} title="حفظ واستخراج بطاقات س/ج" onPress={() => void commitNote(true)} tone="secondary" disabled={saving} />
            {editingId && notes.some(n => n.id === editingId) ? <>
              <Button p={p} title="بطاقة يدوية للملاحظة" tone="secondary" onPress={() => openCardEditor(editingId)} />
              <Button p={p} title="حذف هذه الملاحظة" tone="danger" onPress={() => {
                const note = notes.find(n => n.id === editingId);
                if (note) confirmDelete(note);
              }} />
            </> : null}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>

    <Modal visible={!!cardEditorNoteId} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setCardEditorNoteId(null)}>
      <SafeAreaView style={{ flex: 1, backgroundColor: p.bg }}>
        <ScrollView contentContainerStyle={{ padding: 20, gap: 17 }} keyboardShouldPersistTaps="handled">
          {modalHeader('بطاقة تعليمية', () => setCardEditorNoteId(null))}
          <Field p={p} label="السؤال" value={question} onChangeText={setQuestion} placeholder="ماذا تريد أن تتذكر؟" />
          <Field p={p} label="الإجابة" value={answer} onChangeText={setAnswer} multiline placeholder="الإجابة المختصرة" />
          <Button p={p} title="إنشاء البطاقة" onPress={() => void commitCard()} disabled={saving} />
        </ScrollView>
      </SafeAreaView>
    </Modal>

    <Modal visible={quizOpen} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setQuizOpen(false)}>
      <SafeAreaView style={{ flex: 1, backgroundColor: p.bg }}>
        <ScrollView contentContainerStyle={{ padding: 22, gap: 18 }}>
          {modalHeader('الاختبار السريع', () => setQuizOpen(false))}
          {quizIndex >= quizData.length ? <Panel p={p} style={{ minHeight: 260, justifyContent: 'center' }}>
            <Label p={p} size={34} weight="800" style={{ textAlign: 'center' }}>{quizScore} / {quizData.length}</Label>
            <Label p={p} size={16} style={{ textAlign: 'center' }}>نتيجة الاختبار</Label>
            <Button p={p} title="إعادة الاختبار" onPress={startQuiz} />
            <Button p={p} title="عودة" tone="secondary" onPress={() => setQuizOpen(false)} />
          </Panel> : <>
            <Label p={p} size={13} color={p.muted}>السؤال {quizIndex + 1} من {quizData.length}</Label>
            <Panel p={p} style={{ minHeight: 155, justifyContent: 'center' }}>
              <Label p={p} size={21} weight="700">{quizData[quizIndex]?.question}</Label>
            </Panel>
            {quizData[quizIndex]?.options.map(option => {
              const chosen = quizSelected === option;
              const correct = quizData[quizIndex]?.answer === option;
              return <Pressable key={option} disabled={quizSelected !== null} onPress={() => {
                setQuizSelected(option);
                if (correct) setQuizScore(s => s + 1);
              }} accessibilityRole="button" accessibilityState={{ selected: chosen }}
                style={{ minHeight: 60, backgroundColor: quizSelected !== null && correct ? p.subtle : p.surface,
                  borderWidth: chosen ? 2 : 1, borderColor: chosen ? p.ink : p.border,
                  borderRadius: 16, padding: 15, justifyContent: 'center' }}>
                <Label p={p} size={16} weight={chosen ? '700' : '400'}>{option}</Label>
              </Pressable>;
            })}
            {quizSelected !== null && <>
              <Label p={p} size={14} color={quizSelected === quizData[quizIndex]?.answer ? p.ink : p.danger}>
                {quizSelected === quizData[quizIndex]?.answer ? 'إجابة صحيحة' : `الإجابة الصحيحة: ${quizData[quizIndex]?.answer}`}
              </Label>
              <Button p={p} title={quizIndex === quizData.length - 1 ? 'عرض النتيجة' : 'السؤال التالي'}
                onPress={() => { setQuizIndex(i => i + 1); setQuizSelected(null); }} />
            </>}
          </>}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  </SafeAreaView>;
}

export default function App() {
  return <SafeAreaProvider><AppContent /></SafeAreaProvider>;
}
