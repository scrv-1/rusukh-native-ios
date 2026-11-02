import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo, ActivityIndicator, Alert, AppState, FlatList, KeyboardAvoidingView, Modal, Platform, Pressable,
  ScrollView, StatusBar, TextInput, View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import { arabicRow, Button, Empty, Field, Icon, Label, Panel, Palette, dark, light } from './src/ui';
import { KnowledgeGraph } from './src/KnowledgeGraph';
import { RecoveryBoundary } from './src/RecoveryBoundary';
import { RecoveryPointsPanel } from './src/backup/RecoveryPointsPanel';
import { PortableBackupPanel } from './src/backup/PortableBackupPanel';
import type { PortablePreferences } from './src/backup/portable';
import { StudyHome } from './src/StudyHome';
import { useNoteDraft } from './src/useNoteDraft';
import { SourcesWorkbench } from './src/SourcesWorkbench';
import { AIWorkspace } from './src/AIWorkspace';
import { RemindersPanel } from './src/reminders/RemindersPanel';
import { WorkspaceEditor } from './src/WorkspaceEditor';
import { defaultWorkspace, MODULES, ModuleId, pinnedModules, readWorkspace, Workspace, WORKSPACE_KEY } from './src/workspace';
import { markdownNote, matchesSearch, MAX_NOTE_CHARS, MAX_SOURCE_BYTES, prepareSource } from './src/sources';
import { dueCards, graphEdges, makeId, makeQuiz, normalizeTitle, parseQuestionAnswer, validateBackup, MAX_BACKUP_BYTES, serializeBackup, utf8ByteLength } from './src/core';
import type { Backup, Note, StudyCard, ReviewEvent, Grade } from './src/types';
import {
  Database, deleteCard, deleteNote, getSetting, makeBackup, openStorage,
  readAll, recordReview, restoreBackup, restoreRecoveryPoint, RecoveryPoint, saveCard, saveNoteAndCards, setSetting,
} from './src/storage';

type Tab = 'home' | 'notes' | 'review' | 'graph' | 'settings' | 'sources' | 'tools' | 'ai';
const TABS: { id: Tab; label: string; symbol: string }[] = [
  { id: 'home', label: 'الرئيسية', symbol: 'house.fill' },
  { id: 'notes', label: 'الملاحظات', symbol: 'note.text' },
  { id: 'review', label: 'المراجعة', symbol: 'rectangle.stack.fill' },
  { id: 'graph', label: 'الشبكة', symbol: 'point.3.connected.trianglepath.dotted' },
  { id: 'settings', label: 'الإعدادات', symbol: 'gearshape.fill' },
];
const screenTitle: Record<Tab, string> = {
  home: 'رُسوخ', notes: 'ملاحظاتي', review: 'المراجعة', graph: 'شبكة أفكاري', settings: 'الإعدادات', sources: 'مصادري', tools: 'كل الأدوات', ai: 'مساعد الدراسة المحلي',
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
  const [revealedId, setRevealedId] = useState<string | null>(null);
  const [showCards, setShowCards] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [dataStale, setDataStale] = useState(false);
  // Delayed picker and confirmation callbacks must see the current write barrier.
  const dataStaleRef = useRef(false);
  const [reducedMotion, setReducedMotion] = useState(true);
  const draft = useNoteDraft(db);
  const draftTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const editorBaseline = useRef({title:'', body:''});
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
    setBusy(true);
    (async () => {
      try {
        const opened = db ?? await openStorage();
        if (!active) return;
        const [data, mode, layout] = await Promise.all([readAll(opened), getSetting(opened, 'darkMode'), getSetting(opened, WORKSPACE_KEY)]);
        if (!active) return;
        setClock(Date.now()); setDb(opened); setNotes(data.notes); setCards(data.cards); setReviews(data.reviews);
        setIsDark(mode === 'true'); setWorkspace(readWorkspace(layout)); dataStaleRef.current = false; setDataStale(false);
      } catch (err) {
        Alert.alert('خطأ في فتح قاعدة البيانات', String(err));
      } finally { if (active) setBusy(false); }
    })();
    return () => { active = false; };
  }, [loadAttempt]);

  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled().then(value => { if (active) setReducedMotion(value); }).catch(() => {});
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReducedMotion);
    return () => { active = false; subscription.remove(); };
  }, []);

  const dirty = draftTitle !== editorBaseline.current.title || draftBody !== editorBaseline.current.body;
  useEffect(() => {
    if (!editorOpen || !dirty || saving || draft.loading) return;
    draftTimer.current = setTimeout(() => { void draft.persist({editingId, title:draftTitle, body:draftBody, updatedAt:Date.now()}); }, 700);
    return () => { if (draftTimer.current) clearTimeout(draftTimer.current); };
  }, [editorOpen, dirty, draftTitle, draftBody, editingId, saving, draft.loading]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      if (state !== 'active' && editorOpen && dirty && !saving && !draft.loading) {
        stopDraftTimer(); void draft.persist({editingId,title:draftTitle,body:draftBody,updatedAt:Date.now()});
      }
    });
    return () => subscription.remove();
  }, [editorOpen,dirty,saving,draft.loading,editingId,draftTitle,draftBody]);

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
    else { setRevealedId(null); setTab(id); }
  }

  async function importSource() {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
      if (result.canceled || !result.assets[0]) return;
      const asset = result.assets[0];
      const file = new File(asset.uri);
      if (Math.max(asset.size ?? 0, file.size ?? 0) > MAX_SOURCE_BYTES) throw new Error('الحد الأقصى للملف 1 ميغابايت.');
      const draft = prepareSource(asset.name, await file.text());
      beginEditor({editingId:null,title:draft.title,body:draft.body});
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
    if (!db || dataStaleRef.current || actionLock.current) return false;
    actionLock.current = true; setSaving(true);
    try {
      await fn(db);
      // A committed write remains successful even when its follow-up read fails.
      try { await refresh(db); } catch { dataStaleRef.current = true; setDataStale(true); }
      return true;
    }
    catch (error) { Alert.alert('تعذّر إكمال العملية', String(error)); return false; }
    finally { actionLock.current = false; setSaving(false); }
  }
  function editDraft(value: {editingId:string|null; title:string; body:string}, recovered = false) {
    if (recovered && value.editingId && !notes.some(n => n.id === value.editingId)) {
      Alert.alert('الملاحظة الأصلية غير موجودة', 'يمكنك تصدير المسودة أو حفظها كملاحظة جديدة.');
      value = {...value, editingId:null};
    }
    setEditingId(value.editingId); setDraftTitle(value.title); setDraftBody(value.body);
    const original = value.editingId ? notes.find(n => n.id === value.editingId) : null;
    editorBaseline.current = recovered || value.editingId === null ? {title:original?.title ?? '', body:original?.body ?? ''} : {title:value.title, body:value.body};
    setEditorOpen(true);
  }
  function beginEditor(value: {editingId:string|null; title:string; body:string}) {
    if (draft.loading) return;
    if (draft.status === 'error' && !draft.recoveredDraft) {
      Alert.alert('تعذّر قراءة المسودة السابقة', 'يمكنك إعادة فتح التطبيق للمحاولة مجددًا، أو تجاهل المسودة القديمة لبدء التحرير.', [
        {text:'إلغاء', style:'cancel'}, {text:'تجاهل المسودة القديمة',style:'destructive',onPress:() => {void draft.clear().then(ok => {if (ok) editDraft(value);});}},
      ]); return;
    }
    if (draft.recoveredDraft) {
      Alert.alert('لديك مسودة محفوظة', 'استعدها أولًا، أو تجاهلها لفتح ملاحظة أخرى.', [
        {text:'إلغاء', style:'cancel'},
        {text:'استعادة المسودة', onPress:() => editDraft(draft.recoveredDraft!, true)},
        {text:'تجاهل المسودة', style:'destructive', onPress:() => { void draft.clear().then(ok => { if (ok) editDraft(value); }); }},
      ]);
      return;
    }
    editDraft(value);
  }
  function openNew() { beginEditor({editingId:null,title:'',body:''}); }
  function openNote(note: Note) { beginEditor({editingId:note.id,title:note.title,body:note.body}); }
  function stopDraftTimer() { if (draftTimer.current) clearTimeout(draftTimer.current); }
  async function finishDraftClose(keep: boolean) {
    if (actionLock.current) return;
    actionLock.current = true; setSaving(true); stopDraftTimer();
    try {
      const ok = keep ? await draft.persist({editingId,title:draftTitle,body:draftBody,updatedAt:Date.now()}) : await draft.clear();
      if (ok) setEditorOpen(false);
      else Alert.alert('تعذّر تحديث المسودة', 'النص ما زال في المحرر. حاول مجددًا أو صدّره إلى الملفات.');
    } finally { actionLock.current = false; setSaving(false); }
  }
  function closeNote() {
    if (saving) return;
    if (!dirty) { void finishDraftClose(false); return; }
    Alert.alert('لديك مسودة غير منشورة', 'احتفظ بها على جهازك لتكمل لاحقًا، أو تابع التحرير.', [
      {text:'متابعة التحرير', style:'cancel'},
      {text:'حفظ مسودة وإغلاق', onPress:() => { void finishDraftClose(true); }},
      {text:'تجاهل التعديل', style:'destructive', onPress:() => { void finishDraftClose(false); }},
    ]);
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
    stopDraftTimer(); setEditorOpen(false);
    if (!(await draft.clear())) Alert.alert('حُفظت الملاحظة', 'تعذّر تنظيف المسودة القديمة. يمكنك تجاهلها من الرئيسية.');
    if (autoCards) Alert.alert('البطاقات', created > 0 ? `أُنشئت ${created} بطاقة من أسطر س: وج:.` : 'لم أجد أسئلة جديدة بصيغة س: وج:.');
  }
  function confirmDelete(note: Note) {
    Alert.alert('حذف الملاحظة؟', 'ستُحذف أيضًا بطاقاتها وسجل مراجعاتها، ولا يمكن التراجع.', [
      { text: 'إلغاء', style: 'cancel' },
      { text: 'حذف', style: 'destructive', onPress: () => void action(async d => {
        await deleteNote(d, note.id); stopDraftTimer(); setEditorOpen(false); if (!(await draft.clear())) Alert.alert('حُذفت الملاحظة', 'تعذّر تنظيف المسودة القديمة. يمكنك تجاهلها من الرئيسية.');
      }) },
    ]);
  }
  async function openCardEditor(noteId: string) {
    if (editorOpen && dirty) {
      Alert.alert('احفظ الملاحظة أولًا', 'احفظ تعديلاتك قبل فتح محرر البطاقة حتى لا تفقدها.'); return;
    }
    if (saving || actionLock.current) return;
    if (editorOpen) {
      actionLock.current = true; setSaving(true); stopDraftTimer();
      const cleared = await draft.clear();
      actionLock.current = false; setSaving(false);
      if (!cleared) { Alert.alert('تعذّر تحديث المسودة', 'حاول فتح البطاقة مرة أخرى.'); return; }
    }
    setCardEditorNoteId(noteId); setQuestion(''); setAnswer(''); setEditorOpen(false);
  }
  function closeCard() {
    if (saving) return;
    if (!question.trim() && !answer.trim()) { setCardEditorNoteId(null); return; }
    Alert.alert('تجاهل البطاقة غير المحفوظة؟','يمكنك متابعة كتابتها ثم حفظها.',[{text:'متابعة التحرير',style:'cancel'},{text:'تجاهل',style:'destructive',onPress:()=>setCardEditorNoteId(null)}]);
  }
  async function commitCard() {
    if (!cardEditorNoteId || !question.trim() || !answer.trim()) {
      Alert.alert('بيانات ناقصة', 'أدخل السؤال والإجابة.'); return;
    }
    if (cards.some(c => c.noteId === cardEditorNoteId && normalizeTitle(c.question) === normalizeTitle(question))) {
      Alert.alert('بطاقة مكررة', 'هذا السؤال موجود في الملاحظة.'); return;
    }
    if (question.length > MAX_NOTE_CHARS || answer.length > MAX_NOTE_CHARS) { Alert.alert('النص طويل جدًا', 'الحد الأقصى مليون حرف لكل حقل.'); return; }
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
    if (await action(d => recordReview(d, card, grade))) setRevealedId(null);
  }
  function startQuiz() {
    const questions = makeQuiz(cards, 8);
    if (!questions.length) {
      Alert.alert('بطاقات غير كافية', 'أنشئ بطاقتين بإجابتين مختلفتين على الأقل.'); return;
    }
    setQuizData(questions); setQuizIndex(0); setQuizScore(0); setQuizSelected(null); setQuizOpen(true);
  }
  async function exportData() {
    if (!db || dataStaleRef.current || actionLock.current) return;
    actionLock.current = true; setSaving(true);
    try {
      const snapshot = await capturePortableSnapshot();
      const json = serializeBackup(snapshot.study);
      const file = new File(Paths.cache, `rusukh-backup-${Date.now()}.json`);
      file.create();
      await file.write(json);
      if (!(await Sharing.isAvailableAsync())) throw new Error('المشاركة غير متوفرة على الجهاز');
      await Sharing.shareAsync(file.uri, { mimeType: 'application/json', UTI: 'public.json' });
    } catch (error) { Alert.alert('تعذّر تصدير النسخة', String(error)); }
    finally { actionLock.current = false; setSaving(false); }
  }
  async function capturePortableSnapshot() {
    if (!db || dataStaleRef.current) throw new Error('أعد تحميل البيانات قبل إنشاء النسخة.');
    let snapshot!: { study: Backup; preferences: { isDark: boolean; workspace: Workspace } };
    await db.withExclusiveTransactionAsync(async tx => {
      const data = await readAll(tx);
      const mode = await getSetting(tx, 'darkMode');
      const layout = await getSetting(tx, WORKSPACE_KEY);
      snapshot = { study: makeBackup(data.notes, data.cards, data.reviews),
        preferences: { isDark: mode === 'true', workspace: readWorkspace(layout) } };
    });
    return snapshot;
  }
  async function finishStudyRestore() {
    stopDraftTimer();
    if (!(await draft.clear())) Alert.alert('استُعيدت البيانات', 'تعذّر تنظيف المسودة القديمة. راجعها قبل استعادتها.');
    setRevealedId(null); setQuizOpen(false); setEditorOpen(false); setCardEditorNoteId(null);
  }
  async function restorePortableStudy(backup: Backup): Promise<boolean> {
    return action(async d => { await restoreBackup(d, backup); await finishStudyRestore(); });
  }
  async function applyPortablePreferences(preferences: PortablePreferences): Promise<void> {
    const nextWorkspace = readWorkspace(JSON.stringify(preferences.workspace));
    const saved = await action(async d => {
      await d.withExclusiveTransactionAsync(async tx => {
        await setSetting(tx, 'darkMode', String(preferences.isDark));
        await setSetting(tx, WORKSPACE_KEY, JSON.stringify(nextWorkspace));
      });
      setIsDark(preferences.isDark); setWorkspace(nextWorkspace);
    });
    if (!saved) throw new Error('لم تُطبّق إعدادات النسخة. أعد المحاولة بعد تحديث البيانات.');
  }
  function restorePoint(point: RecoveryPoint): Promise<boolean> {
    return new Promise(resolve => {
      Alert.alert('العودة إلى نقطة الاستعادة؟',
        `ستُستعاد ${point.noteCount} ملاحظة و${point.cardCount} بطاقة. ستُحفظ نقطة رجوع من بياناتك الحالية أولًا. الصور والصوت والإعدادات لا تتغير.`, [
          { text: 'إلغاء', style: 'cancel', onPress: () => resolve(false) },
          { text: 'استعادة', onPress: () => { void action(async d => {
            await restoreRecoveryPoint(d, point.id); await finishStudyRestore();
          }).then(resolve); } },
        ], { cancelable: true, onDismiss: () => resolve(false) });
    });
  }
  async function importData() {
    if (!db || dataStaleRef.current || actionLock.current) return;
    try {
      const picked = await DocumentPicker.getDocumentAsync({ type: 'application/json', copyToCacheDirectory: true });
      if (picked.canceled || !picked.assets[0] || dataStaleRef.current || actionLock.current) return;
      const file = new File(picked.assets[0].uri);
      if (Math.max(file.size ?? 0, picked.assets[0].size ?? 0) > MAX_BACKUP_BYTES) throw new Error('الملف أكبر من 15 ميغابايت');
      const text = await file.text();
      if (dataStaleRef.current || actionLock.current) return;
      if (utf8ByteLength(text) > MAX_BACKUP_BYTES) throw new Error('الملف أكبر من 15 ميغابايت');
      const parsed: unknown = JSON.parse(text);
      if (!validateBackup(parsed)) throw new Error('النسخة غير صالحة أو ليست من رُسوخ');
      const backup = parsed as Backup;
      Alert.alert('استبدال البيانات الحالية؟',
        `سيتم استبدال ${notes.length} ملاحظة بـ ${backup.notes.length} ملاحظة. تُحفظ نقطة رجوع تلقائيًا قبل الاستبدال؛ احتفظ أيضًا بنسخة خارج التطبيق.`, [
          { text: 'إلغاء', style: 'cancel' },
          { text: 'استبدال', style: 'destructive', onPress: () => void action(async d => { await restoreBackup(d, backup); await finishStudyRestore(); }) },
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
    return <View style={{ gap: 5, marginBottom: 12 }}>
      <Label p={p} size={30} weight="800" role="header">{title}</Label>
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
        <View style={{ flexDirection: arabicRow, justifyContent: 'space-between', gap: 10 }}>
          <View style={{ flex: 1, gap: 5 }}>
            <Label p={p} size={16} weight="700" numberOfLines={1}>{note.title}</Label>
            <Label p={p} size={12} color={p.muted} numberOfLines={compact ? 1 : 2}>
              {note.body.replace(/\[\[|\]\]/g, '') || 'ملاحظة فارغة'}</Label>
          </View>
          <Icon name="chevron.left" size={16} p={p} color={p.muted} />
        </View>
      </Pressable>
      <View style={{ flexDirection: arabicRow, justifyContent: 'space-between', alignItems: 'center' }}>
        <Label p={p} size={12} color={p.muted}>{cardCount} بطاقة</Label>
        <Button title="بطاقة جديدة" tone="secondary" compact p={p} onPress={() => openCardEditor(note.id)} icon="plus" />
      </View>
    </Panel>;
  }

  function homeScreen() {
    return <View style={{gap:16}}>
      {draft.recoveredDraft && <Panel p={p}>
        <Label p={p} role="header" weight="700">أكمل مسودتك</Label>
        <Label p={p} color={p.muted} numberOfLines={2}>{draft.recoveredDraft.title || 'ملاحظة بلا عنوان'}</Label>
        <Button p={p} title="استعادة المسودة" onPress={() => editDraft(draft.recoveredDraft!, true)} />
        <Button p={p} title="تجاهل المسودة" tone="plain" onPress={() => Alert.alert('تجاهل المسودة؟','ستبقى الملاحظة المنشورة كما هي.',[
          {text:'إلغاء',style:'cancel'}, {text:'تجاهل',style:'destructive',onPress:()=>{void draft.clear();}},
        ])} />
      </Panel>}
      <StudyHome p={p} workspace={workspace} notes={notes} cardsCount={cards.length} dueCount={due.length}
        todayReviewed={todayReviewed} linksCount={links.length} onCustomize={() => setCustomizing(true)}
        onTools={() => setTab('tools')} onModule={openModule} onOpenNote={openNote} onNewNote={openNew} />
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
    return <SourcesWorkbench p={p} notes={notes} onImportText={() => void importSource()}
      onDraft={value => beginEditor({editingId:null,...value})} />;
  }
  function aiScreen() {
    return <AIWorkspace p={p} notes={notes} onDraft={value => beginEditor({editingId:null,...value})} />;
  }
  function notesScreen() {
    const filtered = notes.filter(n => matchesSearch(n.title, n.body, search));
    return <FlatList data={filtered} keyExtractor={note => note.id} keyboardShouldPersistTaps="handled"
      contentContainerStyle={{paddingHorizontal:20,paddingTop:14,paddingBottom:32,gap:14}}
      initialNumToRender={10} windowSize={7} renderItem={({item}) => noteTile(item)}
      ListHeaderComponent={<View style={{gap:14}}>
        {header('ملاحظاتي', `${notes.length} ملاحظة محفوظة على جهازك`)}
        <View style={{ flexDirection: arabicRow, gap: 9 }}>
          <TextInput value={search} onChangeText={setSearch} placeholder="ابحث في الملاحظات..."
            placeholderTextColor={p.muted} textAlign="right" accessibilityLabel="البحث في الملاحظات"
            style={{ flex: 1, color: p.ink, backgroundColor: p.surface, borderRadius: 15, paddingHorizontal: 14,
              borderWidth: 1, borderColor: p.border, minHeight: 48 }} />
          <Button p={p} title="+ جديد" compact onPress={openNew} />
        </View>
      </View>}
      ListEmptyComponent={<Panel p={p}><Empty p={p} title={notes.length ? 'لا توجد نتائج' : 'ابدأ بملاحظتك الأولى'}
        detail={notes.length ? 'جرّب عبارة أقصر أو امسح البحث' : 'اكتب فكرة قصيرة أو استورد نصًا من ملفاتك'} />
        {search ? <Button p={p} title="مسح البحث" tone="secondary" onPress={() => setSearch('')} /> :
          <Button p={p} title="إضافة أول ملاحظة" onPress={openNew} />}</Panel>}
    />;
  }
  function reviewScreen() {
    const current = due[0];
    return <View style={{ gap: 16 }}>
      {header('المراجعة', 'تذكّر الإجابة أولًا، ثم قيّم سهولتها')}
      <View style={{ flexDirection: arabicRow, gap: 10 }}>
        {stat(due.length, 'مستحقة الآن')}{stat(todayReviewed, 'مُراجعة اليوم')}
      </View>
      {current ? <Panel p={p} style={{ minHeight: 290, padding: 22, justifyContent: 'space-between' }}>
        <Label p={p} size={12} color={p.muted}>{notes.find(n => n.id === current.noteId)?.title ?? 'بطاقة'}</Label>
        <Label p={p} size={23} weight="700" style={{ marginVertical: 17 }}>{current.question}</Label>
        {revealedId === current.id ? <View style={{ gap: 12 }}>
          <View style={{ backgroundColor: p.subtle, padding: 17, borderRadius: 15 }}>
            <Label p={p} size={17}>{current.answer}</Label>
          </View>
          <Label p={p} size={12} color={p.muted}>اختر تقييمًا لتحديد موعد المراجعة القادمة.</Label>
          <View style={{ flexDirection: arabicRow, flexWrap: 'wrap', gap: 7 }}>
            {([['again','مُجددًا'],['hard','صعب'],['good','جيد'],['easy','سهل']] as [Grade,string][]).map(([grade,label]) =>
              <Button key={grade} p={p} title={label} tone={grade === 'good' ? 'primary' : 'secondary'}
                compact disabled={saving} onPress={() => void review(current,grade)} style={{ flexGrow: 1 }} />)}
          </View>
        </View> : <Button title="إظهار الإجابة" p={p} onPress={() => setRevealedId(current.id)} />}
      </Panel> : <Panel p={p}><Empty p={p} title="لا توجد بطاقات مستحقة الآن" detail="يمكنك إضافة بطاقات أو إجراء اختبار سريع" /></Panel>}
      <Button title="اختبار اختيارات" p={p} tone="secondary" icon="checkmark.circle" onPress={startQuiz} />
      <Button p={p} title={showCards ? 'إخفاء إدارة البطاقات' : `إدارة البطاقات (${cards.length})`} tone="plain" onPress={() => setShowCards(v => !v)} />
      {showCards && cards.map(c => <Panel key={c.id} p={p} style={{ padding: 14, gap: 8 }}>
        <Label p={p} size={14} weight="700">{c.question}</Label>
        <Label p={p} size={13} color={p.muted}>{c.answer}</Label>
        <View style={{ flexDirection: arabicRow, justifyContent: 'space-between', alignItems: 'center' }}>
          <Label p={p} size={12} color={p.muted}>{c.dueAt <= clock ? 'مستحقة الآن' : `قادمة: ${new Date(c.dueAt).toLocaleDateString('ar-SA')}`}</Label>
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
      <View style={{ flexDirection: arabicRow, justifyContent: 'space-between', alignItems: 'center' }}>
        <Label p={p} size={16} weight="700">المظهر {isDark ? 'الداكن' : 'الفاتح'}</Label>
        <Button title={isDark ? 'فاتح' : 'داكن'} p={p} tone="secondary" onPress={() => void toggleDark()} />
      </View>
    </Panel>
    {db && <RemindersPanel db={db} p={p} />}
    <Panel p={p}>
      <Label p={p} size={17} weight="700">النسخ الاحتياطي</Label>
      <Label p={p} size={13} color={p.muted}>نسخة JSON تشمل الملاحظات والبطاقات والمراجعات فقط. قبل الاستيراد تُحفظ نقطة رجوع تلقائيًا، وتبقى أحدث ثلاث نقاط على الجهاز. ليست بديلًا عن نسخة في الملفات.</Label>
      <Button p={p} title="تصدير نسخة إلى الملفات" icon="square.and.arrow.up" disabled={saving} onPress={() => void exportData()} />
      <Button p={p} title="استيراد نسخة من الملفات" tone="secondary" icon="square.and.arrow.down" disabled={saving} onPress={() => void importData()} />
    </Panel>
    {db && <RecoveryPointsPanel db={db} p={p} disabled={saving || dataStale} onRestore={restorePoint} />}
    {db && <PortableBackupPanel p={p} disabled={saving || dataStale} getSnapshot={capturePortableSnapshot}
      restoreStudy={restorePortableStudy} applyPreferences={applyPortablePreferences} />}
    <Panel p={p}>
      <Label p={p} weight="700">عن النسخة</Label>
      <Label p={p} size={13} color={p.muted}>رُسوخ 0.4.2 — استيراد محمي، واستعادة وسائط آمنة، وتحسين استمرارية التسجيل. مساعد الدراسة المحلي تجريبي ويحتاج مراجعة النتائج. جدولة المراجعة مبسطة وليست FSRS. لا مزامنة سحابية.</Label>
    </Panel>
  </View>; }
  function modalHeader(title: string, close: () => void) {
    return <View style={{ flexDirection: arabicRow, justifyContent: 'space-between', alignItems: 'center', paddingBottom: 14 }}>
      <Label p={p} size={21} weight="800" role="header" style={{flex:1}}>{title}</Label>
      <Button p={p} title="إغلاق" tone="secondary" compact disabled={saving} onPress={close} />
    </View>;
  }

  if (busy) return <SafeAreaView style={{ flex: 1, backgroundColor: p.bg, justifyContent: 'center', alignItems: 'center', gap: 12 }}>
    <ActivityIndicator color={p.ink} /><Label p={p}>جاري فتح رُسوخ…</Label>
  </SafeAreaView>;
  if (!db) return <SafeAreaView style={{ flex: 1, justifyContent: 'center', padding: 30, backgroundColor: p.bg }}>
    <Empty p={p} title="تعذّر تشغيل رُسوخ" detail="بياناتك لم تُحذف. حاول فتحها مرة أخرى." /><Button p={p} title="إعادة المحاولة" onPress={() => setLoadAttempt(n => n+1)} />
  </SafeAreaView>;
  if (dataStale) return <SafeAreaView style={{flex:1,padding:24,justifyContent:'center',backgroundColor:p.bg,gap:16}}>
    <Label p={p} size={22} weight="700">حُفظ التغيير؛ تعذّر تحديث العرض</Label>
    <Label p={p}>أعد تحميل البيانات لعرض آخر نسخة. لن نكرر عملية الحفظ.</Label>
    <Button p={p} title="إعادة تحميل البيانات" onPress={() => setLoadAttempt(n => n+1)} />
  </SafeAreaView>;
  return <SafeAreaView style={{ flex: 1, backgroundColor: p.bg }}>
    <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
    <View style={{ paddingHorizontal: 22, minHeight: 56, paddingVertical: 6, flexDirection: arabicRow, alignItems: 'center', justifyContent: 'space-between' }}>
      <View style={{ flexDirection: arabicRow, alignItems: 'center', gap: 9 }}>
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
    {tab === 'notes' ? notesScreen() : <ScrollView key={tab} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 14, paddingBottom: 32, gap: 2 }}>
      {tab === 'home' ? homeScreen() : tab === 'review' ? reviewScreen() : tab === 'graph' ? graphScreen() : tab === 'sources' ? sourcesScreen() : tab === 'ai' ? aiScreen() : tab === 'tools' ? toolsScreen() : settingsScreen()}
    </ScrollView>}
    <View style={{ flexDirection: arabicRow, borderTopWidth: 1, borderColor: p.border, backgroundColor: p.surface, paddingTop: 8, paddingBottom: 6 }}>
      {visibleTabs.map(t => <Pressable key={t.id} accessibilityRole="tab" accessibilityState={{ selected: tab === t.id }}
        accessibilityLabel={t.label} onPress={() => { setTab(t.id); setRevealedId(null); }}
        style={{ flex: 1, minHeight: 57, alignItems: 'center', justifyContent: 'center', gap: 3, paddingHorizontal: 4 }}>
        <Icon name={t.symbol} p={p} size={22} color={tab === t.id ? p.ink : p.muted} />
        <Label p={p} size={11} color={tab === t.id ? p.ink : p.muted} style={{textAlign:'center'}} weight={tab === t.id ? '700' : '400'}>{t.label}</Label>
      </Pressable>)}
    </View>

    {customizing && <WorkspaceEditor reducedMotion={reducedMotion} value={workspace} p={p} onCancel={() => setCustomizing(false)} onSave={saveWorkspace} />}

    <Modal visible={editorOpen} animationType={reducedMotion ? "none" : "slide"} presentationStyle="pageSheet" onRequestClose={closeNote}>
      <SafeAreaView style={{ flex: 1, backgroundColor: p.bg }}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 20, gap: 17 }}>
            {modalHeader(editingId ? 'تعديل الملاحظة' : 'ملاحظة جديدة', closeNote)}
            <Label p={p} size={12} color={draft.status === 'error' ? p.danger : p.muted}>{draft.status === 'saved' && draft.recoveredDraft?.editingId === editingId && draft.recoveredDraft?.title === draftTitle && draft.recoveredDraft?.body === draftBody ? 'مسودة محفوظة على جهازك' : draft.status === 'saving' ? 'جارٍ حفظ المسودة…' : draft.status === 'error' ? 'تعذّر حفظ المسودة؛ احفظ الملاحظة أو صدّر النص' : 'التعديلات تُحفظ كمسودة محلية'}</Label>
            <Field p={p} label="العنوان" maxLength={160} editable={!saving} value={draftTitle} onChangeText={setDraftTitle} placeholder="عنوان الملاحظة" />
            <Field p={p} label="المحتوى" maxLength={MAX_NOTE_CHARS} editable={!saving} multiline numberOfLines={12} value={draftBody} onChangeText={setDraftBody}
              placeholder="اكتب هنا… للربط استخدم [[عنوان ملاحظة]]" />
            <Label p={p} size={12} color={p.muted}>استخراج أسئلة مكتوبة: اكتب سؤالًا في س: والإجابة في ج: على سطر منفصل.</Label>
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

    <Modal visible={!!cardEditorNoteId} animationType={reducedMotion ? "none" : "slide"} presentationStyle="pageSheet" onRequestClose={closeCard}>
      <SafeAreaView style={{ flex: 1, backgroundColor: p.bg }}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{flex:1}}><ScrollView contentContainerStyle={{ padding: 20, gap: 17 }} keyboardShouldPersistTaps="handled">
          {modalHeader('بطاقة تعليمية', closeCard)}
          <Field p={p} label="السؤال" maxLength={MAX_NOTE_CHARS} editable={!saving} value={question} onChangeText={setQuestion} placeholder="ماذا تريد أن تتذكر؟" />
          <Field p={p} label="الإجابة" maxLength={MAX_NOTE_CHARS} editable={!saving} value={answer} onChangeText={setAnswer} multiline placeholder="الإجابة المختصرة" />
          <Button p={p} title="إنشاء البطاقة" onPress={() => void commitCard()} disabled={saving} />
        </ScrollView></KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>

    <Modal visible={quizOpen} animationType={reducedMotion ? "none" : "slide"} presentationStyle="pageSheet" onRequestClose={() => setQuizOpen(false)}>
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
  return <SafeAreaProvider><RecoveryBoundary><AppContent /></RecoveryBoundary></SafeAreaProvider>;
}
