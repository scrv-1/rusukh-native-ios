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
import { KnowledgeGraph, createGraphSession } from './src/KnowledgeGraph';
import { RecoveryBoundary } from './src/RecoveryBoundary';
import { RecoveryPointsPanel } from './src/backup/RecoveryPointsPanel';
import { PortableBackupPanel } from './src/backup/PortableBackupPanel';
import type { PortablePreferences } from './src/backup/portable';
import { StudyHome } from './src/StudyHome';
import { NOTE_DRAFT_KEY, useNoteDraft, DraftSourceNote } from './src/useNoteDraft';
import { SourcesWorkbench } from './src/SourcesWorkbench';
import { AIWorkspace } from './src/AIWorkspace';
import { RemindersPanel } from './src/reminders/RemindersPanel';
import { ToolsScreen } from './src/ToolsScreen';
import { StudyQuiz } from './src/StudyQuiz';
import { usePersistentDraft } from './src/usePersistentDraft';
import { SOURCE_DRAFT_KEY, CARD_DRAFT_KEY, validSourceForm, validCardDraft, sourceHasContent, SourceForm, CardDraft } from './src/studyDrafts';
import { AI_STUDY_SESSION_KEY, useAIStudySession } from './src/ai/useAIStudySession';
import { createDatabaseSnapshot } from './src/databaseSnapshot';
import { WorkspaceEditor } from './src/WorkspaceEditor';
import { defaultWorkspace, MODULES, ModuleId, readWorkspace, Workspace, WORKSPACE_KEY } from './src/workspace';
import { markdownNote, matchesSearch, MAX_NOTE_CHARS, MAX_SOURCE_BYTES, prepareSource } from './src/sources';
import { dueCards, graphEdges, makeId, wikiLinkTitleError, normalizeTitle, parseQuestionAnswer, validateBackup, MAX_BACKUP_BYTES, serializeBackup, utf8ByteLength } from './src/core';
import type { Backup, Note, StudyCard, ReviewEvent, Grade } from './src/types';
import {
  Database, deleteCard, deleteNote, getSetting, makeBackup, openStorage,
  readAll, recordReview, restoreBackup, restoreRecoveryPoint, RecoveryPoint, saveCard, saveNoteAndCards, setSetting, updateCard,
} from './src/storage';

type Tab = 'home' | 'notes' | 'review' | 'graph' | 'settings' | 'sources' | 'tools' | 'ai';
const TABS: { id: Tab; label: string; symbol: string }[] = [
  { id: 'home', label: 'الرئيسية', symbol: 'house.fill' },
  { id: 'notes', label: 'الملاحظات', symbol: 'note.text' },
  { id: 'review', label: 'المراجعة', symbol: 'rectangle.stack.fill' },
  { id: 'tools', label: 'الأدوات', symbol: 'square.grid.2x2' },
  { id: 'settings', label: 'الإعدادات', symbol: 'gearshape.fill' },
];
const screenTitle: Record<Tab, string> = {
  home: 'مساحتي', notes: 'ملاحظاتي', review: 'المراجعة', graph: 'شبكة أفكاري', settings: 'الإعدادات', sources: 'مصادري', tools: 'كل الأدوات', ai: 'مساعد الدراسة المحلي',
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
  const [draftSourceNote,setDraftSourceNote]=useState<DraftSourceNote|undefined>();
  const [cardEditorNoteId, setCardEditorNoteId] = useState<string | null>(null);
  const [editingCardId, setEditingCardId] = useState<string|null>(null);
  const [graphSession,setGraphSession]=useState(createGraphSession);
  const [afterSave, setAfterSave] = useState<{id:string;title:string;studyNoteId:string}|null>(null);
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
  const sourceDraft = usePersistentDraft<SourceForm>(db,SOURCE_DRAFT_KEY,validSourceForm);
  const cardDraft = usePersistentDraft<CardDraft>(db,CARD_DRAFT_KEY,validCardDraft);
  const aiSession = useAIStudySession(db);
  const sessionRef = useRef({sourceDraft,cardDraft,aiSession}); sessionRef.current={sourceDraft,cardDraft,aiSession};
  const draftTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const noteDraftTouched=useRef(false);
  const editorBaseline = useRef({title:'', body:''});
  const sourceImportOwner = useRef(0);
  const beginEditorRef = useRef(beginEditor);
  beginEditorRef.current = beginEditor;
  const [quizSession,setQuizSession]=useState(0);
  const [practiceNoteId,setPracticeNoteId]=useState<string|null>(null);
  const [quizSourceNote,setQuizSourceNote]=useState<Note|null>(null);
  const [quizOpen, setQuizOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const actionLock = useRef(false);
  const preferenceLock = useRef(false);
  const [workspace, setWorkspace] = useState<Workspace>(defaultWorkspace);
  const [customizing, setCustomizing] = useState(false);
  const [clock, setClock] = useState(Date.now);
  const visibleTabs = TABS;
  const p = isDark ? dark : light;
  // Restore callbacks may outlive the render that opened a picker/confirmation.
  // Keep the edit barrier live; the persisted slot is read again under actionLock.
  const restoreDraftState = useRef({ editorOpen, cardEditorOpen: !!cardEditorNoteId,
    loading: draft.loading, status: draft.status, retained: !!draft.recoveredDraft });
  restoreDraftState.current = { editorOpen, cardEditorOpen: !!cardEditorNoteId,
    loading: draft.loading, status: draft.status, retained: !!draft.recoveredDraft };
  const due = useMemo(() => dueCards(cards, clock), [cards, clock]);
  const links = useMemo(() => graphEdges(notes), [notes]);
  const today = new Date(clock).toDateString();
  const todayReviewed = reviews.filter(r => new Date(r.reviewedAt).toDateString() === today).length;

  useEffect(() => {
    sourceImportOwner.current++;
    return () => { sourceImportOwner.current++; };
  }, [tab]);

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
    if (!editorOpen || saving || draft.loading) return;
    if(!dirty){if(noteDraftTouched.current){noteDraftTouched.current=false;void draft.clear();}return;}
    draftTimer.current = setTimeout(() => { noteDraftTouched.current=true;void draft.persist({editingId, title:draftTitle, body:draftBody, sourceNote:draftSourceNote, updatedAt:Date.now()}); }, 700);
    return () => { if (draftTimer.current) clearTimeout(draftTimer.current); };
  }, [editorOpen, dirty, draftTitle, draftBody, draftSourceNote, editingId, saving, draft.loading]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      if (state !== 'active' && editorOpen && dirty && !saving && !draft.loading) {
        stopDraftTimer(); noteDraftTouched.current=true;void draft.persist({editingId,title:draftTitle,body:draftBody,sourceNote:draftSourceNote,updatedAt:Date.now()});
      }
    });
    return () => subscription.remove();
  }, [editorOpen,dirty,saving,draft.loading,editingId,draftTitle,draftBody,draftSourceNote]);

  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now()), 30000);
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') setClock(Date.now()); });
    return () => { clearInterval(timer); subscription.remove(); };
  }, []);

  useEffect(()=>{
    if(!cardEditorNoteId || cardDraft.loading || saving)return;
    const note=notes.find(n=>n.id===cardEditorNoteId);if(!note)return;
    const original=cards.find(c=>c.id===editingCardId);
    const changed=original?question!==original.question||answer!==original.answer:!!question.trim()||!!answer.trim();
    if(changed)cardDraft.update({version:1,noteId:note.id,noteCreatedAt:note.createdAt,cardId:editingCardId,question,answer});
    else if(cardDraft.getCurrent())cardDraft.update(null);
  },[cardEditorNoteId,editingCardId,question,answer,cardDraft.loading,saving]);

  async function saveWorkspace(next: Workspace): Promise<boolean> {
    if (!db || preferenceLock.current) return false;
    preferenceLock.current = true;
    try {
      await setSetting(db, WORKSPACE_KEY, JSON.stringify(next));
      setWorkspace(next);
      return true;
    } catch {
      Alert.alert('لم يُحفظ الترتيب', 'اختياراتك ما زالت هنا. حاول الحفظ مرة أخرى.');
      return false;
    } finally { preferenceLock.current = false; }
  }

  function openModule(id: ModuleId) {
    if (id === 'quiz') startQuiz();
    else { setRevealedId(null); if(id==='review')setShowCards(due.length===0);setTab(id); }
  }

  async function importSource() {
    const owner = ++sourceImportOwner.current;
    const current = () => owner === sourceImportOwner.current && !dataStaleRef.current;
    if (!current()) return;
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
      if (!current()) return;
      if (result.canceled || !result.assets[0]) return;
      const asset = result.assets[0];
      const file = new File(asset.uri);
      if (Math.max(asset.size ?? 0, file.size ?? 0) > MAX_SOURCE_BYTES) throw new Error('الحد الأقصى للملف 1 ميغابايت.');
      const draft = prepareSource(asset.name, await file.text());
      if (!current()) return;
      beginEditorRef.current({editingId:null,title:draft.title,body:draft.body});
    } catch (error) { if (current()) Alert.alert('تعذّر قراءة المصدر', String(error)); }
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
  function editDraft(value: {editingId:string|null; title:string; body:string;sourceNote?:DraftSourceNote}, recovered = false) {
    if (actionLock.current) return;
    restoreDraftState.current.editorOpen = true;
    sourceImportOwner.current++;
    if (recovered && value.editingId && !notes.some(n => n.id === value.editingId)) {
      Alert.alert('الملاحظة الأصلية غير موجودة', 'يمكنك تصدير المسودة أو حفظها كملاحظة جديدة.');
      value = {...value, editingId:null};
    }
    noteDraftTouched.current=recovered;setDraftSourceNote(value.sourceNote);setEditingId(value.editingId); setDraftTitle(value.title); setDraftBody(value.body);
    const original = value.editingId ? notes.find(n => n.id === value.editingId) : null;
    editorBaseline.current = recovered || value.editingId === null ? {title:original?.title ?? '', body:original?.body ?? ''} : {title:value.title, body:value.body};
    setEditorOpen(true);
  }
  function beginEditor(value: {editingId:string|null; title:string; body:string;sourceNote?:DraftSourceNote}) {
    if (actionLock.current) return;
    sourceImportOwner.current++;
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
      const ok = keep ? await draft.persist({editingId,title:draftTitle,body:draftBody,sourceNote:draftSourceNote,updatedAt:Date.now()}) : await draft.clear();
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
  async function commitNote(autoCards = false, syncExisting = false) {
    if(draftTitle.includes('\u0000')||draftBody.includes('\u0000')){Alert.alert('محرف غير صالح','احذف محرف NUL من النص قبل نشر المادة؛ يمكنك الاحتفاظ بالمسودة أو تصديرها.');return;}
    let name = draftTitle.trim();
    if(!name){
      const base=(draftBody.trim().split('\n').find(line=>line.trim())||'').replace(/[\[\]|\r\n]/g,' ').trim().slice(0,150);
      if(!base){Alert.alert('الملاحظة فارغة','اكتب فكرة أو اختر عنوانًا قبل الحفظ.');return;}
      name=base;let suffix=2;while(notes.some(n=>n.id!==editingId&&normalizeTitle(n.title)===normalizeTitle(name)))name=`${base} (${suffix++})`;
    }
    const titleError=wikiLinkTitleError(name);if(titleError){Alert.alert('عدّل العنوان',titleError);return;}
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
    const source=draftSourceNote&&notes.find(n=>n.id===draftSourceNote.id&&n.createdAt===draftSourceNote.createdAt&&n.updatedAt===draftSourceNote.updatedAt);
    if(autoCards&&draftSourceNote&&!source){Alert.alert('تغير المصدر الأصلي','راجع المصدر الحالي قبل استخراج البطاقات. يمكنك حفظ هذه المسودة كملاحظة للاحتفاظ بالنص والشواهد.');return;}
    const studyNoteId=source?.id??note.id;
    const related=cards.filter(c=>c.noteId===studyNoteId);
    const changedPairs=pairs.filter(pair=>related.some(c=>normalizeTitle(c.question)===normalizeTitle(pair.question)&&c.answer!==pair.answer));
    if(changedPairs.length&&!syncExisting){
      const owner=sourceImportOwner.current;
      Alert.alert('تحديث إجابات البطاقات؟',`تغيرت إجابة ${changedPairs.length} بطاقة. ستُحفظ الإجابات الجديدة مع بقاء مواعيدها وسجل مراجعتها.`,[
        {text:'متابعة التحرير',style:'cancel'},
        {text:'حفظ وتحديث البطاقات',onPress:()=>{if(owner===sourceImportOwner.current)void commitNote(true,true);}},
      ]);return;
    }
    const existing = new Set(related.map(c => normalizeTitle(c.question)));
    const additions: StudyCard[] = [];
    for (const pair of pairs) {
      const normalized = normalizeTitle(pair.question);
      if (existing.has(normalized)) continue;
      additions.push({ id: makeId('card'), noteId: studyNoteId, question: pair.question,
        answer: pair.answer, dueAt: now, intervalDays: 0, ease: 2.5, repetitions: 0, updatedAt: now });
      existing.add(normalized);
    }
    const created = additions.length;
    if(syncExisting)for(const pair of changedPairs){const old=related.find(c=>normalizeTitle(c.question)===normalizeTitle(pair.question))!;additions.push({...old,answer:pair.answer,updatedAt:now});}
    const saved = await action(d => saveNoteAndCards(d, note, additions));
    if (!saved) return;
    stopDraftTimer(); setEditorOpen(false); setAfterSave({id:note.id,title:note.title,studyNoteId});setTab('home');
    if (!(await draft.clear())) Alert.alert('حُفظت الملاحظة', 'تعذّر تنظيف المسودة القديمة. يمكنك تجاهلها من الرئيسية.');
    if (autoCards) Alert.alert('البطاقات', `أُنشئت ${created} بطاقة، وحُدّثت ${syncExisting?changedPairs.length:0}. ${pairs.length?'يمكنك بدء التدريب الآن.':'لم نجد س/ج مكتوبة؛ أضف بطاقة يدويًا من الخطوة التالية.'}`);
  }
  function confirmDelete(note: Note) {
    Alert.alert('حذف الملاحظة؟', 'ستُحذف أيضًا بطاقاتها وسجل مراجعاتها، ولا يمكن التراجع.', [
      { text: 'إلغاء', style: 'cancel' },
      { text: 'حذف', style: 'destructive', onPress: () => void action(async d => {
        await deleteNote(d, note.id); stopDraftTimer(); setEditorOpen(false); if (!(await draft.clear())) Alert.alert('حُذفت الملاحظة', 'تعذّر تنظيف المسودة القديمة. يمكنك تجاهلها من الرئيسية.');
      }) },
    ]);
  }
  async function openCardEditor(noteId: string, card?:StudyCard, recovered=false) {
    if(cardDraft.loading){Alert.alert('انتظر المسودة','جارٍ قراءة مسودة البطاقة.');return;}
    if(cardDraft.status==='error'&&!cardDraft.value){Alert.alert('تعذّر قراءة مسودة البطاقة','أعد محاولة استعادتها من الرئيسية قبل تحرير بطاقة جديدة.');return;}
    if(cardDraft.getCurrent()&&!recovered){Alert.alert('لديك مسودة بطاقة','أكمل مسودة البطاقة أو تجاهلها صراحة من الرئيسية قبل البدء ببطاقة أخرى.');setTab('home');return;}
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
    restoreDraftState.current.cardEditorOpen = true;
    setCardEditorNoteId(noteId);setEditingCardId(card?.id??null);setQuestion(card?.question??'');setAnswer(card?.answer??'');setEditorOpen(false);
  }
  function resumeCardDraft(){
    const value=cardDraft.getCurrent();if(!value)return;
    const note=notes.find(n=>n.id===value.noteId&&n.createdAt===value.noteCreatedAt);
    if(!note){Alert.alert('مصدر المسودة غير موجود','يمكنك تصدير نص المسودة من الرئيسية؛ لم نربطها بملاحظة أخرى.');return;}
    if(value.cardId&&!cards.some(c=>c.id===value.cardId&&c.noteId===note.id)){Alert.alert('البطاقة الأصلية غير موجودة','صدّر المسودة أولًا ثم أنشئ بطاقة جديدة؛ لم تُستبدل بطاقة أخرى.');return;}
    restoreDraftState.current.cardEditorOpen=true;setCardEditorNoteId(note.id);setEditingCardId(value.cardId);setQuestion(value.question);setAnswer(value.answer);setEditorOpen(false);
  }
  async function finishCardClose(keep:boolean){
    if(actionLock.current)return;actionLock.current=true;setSaving(true);
    try{const note=notes.find(n=>n.id===cardEditorNoteId);
      const accepted=!keep||!!note&&cardDraft.update({version:1,noteId:note.id,noteCreatedAt:note.createdAt,cardId:editingCardId,question,answer});
      const ok=accepted&&(keep?await cardDraft.flush():await cardDraft.clear());if(ok)setCardEditorNoteId(null);else Alert.alert('لم تُغلق المسودة','تعذّر حفظ البطاقة. النص باقٍ هنا. أعد المحاولة أو صدّره.');}
    finally{actionLock.current=false;setSaving(false);}
  }
  function closeCard() {
    if(saving)return;
    const original=cards.find(c=>c.id===editingCardId);
    const changed=original?question!==original.question||answer!==original.answer:!!question.trim()||!!answer.trim();
    if(!changed){void finishCardClose(false);return;}
    Alert.alert('لديك مسودة بطاقة','احتفظ بها لتكمل لاحقًا، أو تابع التحرير.',[
      {text:'متابعة التحرير',style:'cancel'}, {text:'حفظ مسودة وإغلاق',onPress:()=>void finishCardClose(true)},
      {text:'تجاهل',style:'destructive',onPress:()=>void finishCardClose(false)},
    ]);
  }
  async function commitCard() {
    if (!cardEditorNoteId || !question.trim() || !answer.trim()) {
      Alert.alert('بيانات ناقصة', 'أدخل السؤال والإجابة.'); return;
    }
    if (cards.some(c => c.id !== editingCardId && c.noteId === cardEditorNoteId && normalizeTitle(c.question) === normalizeTitle(question))) {
      Alert.alert('بطاقة مكررة', 'هذا السؤال موجود في الملاحظة.'); return;
    }
    if(question.includes('\u0000')||answer.includes('\u0000')){Alert.alert('محرف غير صالح','احذف محرف NUL من النص قبل نشر البطاقة؛ مسودتك محفوظة ويمكن تصديرها.');return;}
    if (question.length > MAX_NOTE_CHARS || answer.length > MAX_NOTE_CHARS) { Alert.alert('النص طويل جدًا', 'الحد الأقصى مليون حرف لكل حقل.'); return; }
    const now = Date.now();
    const saved = await action(async d => editingCardId ? updateCard(d,editingCardId,{question:question.trim(),answer:answer.trim()}) : saveCard(d, { id: makeId('card'), noteId: cardEditorNoteId,
      question: question.trim(), answer: answer.trim(), dueAt: now, intervalDays: 0,
      ease: 2.5, repetitions: 0, updatedAt: now }));
    if(saved){setCardEditorNoteId(null);setTab('review');setShowCards(true);if(!(await cardDraft.clear()))Alert.alert('حُفظت البطاقة','تعذّر تنظيف مسودة البطاقة؛ يمكنك تجاهلها من الرئيسية.');}
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
  function startQuiz(noteId:string|null=null){setPracticeNoteId(noteId);setQuizSourceNote(null);setQuizSession(v=>v+1);setQuizOpen(true);}
  async function exportRecoveryText(text:string,title:string){
    try{const file=new File(Paths.cache,`rusukh-draft-${Date.now()}.md`);file.create();await file.write(`# ${title}\n\n${text}`);if(!(await Sharing.isAvailableAsync()))throw new Error('المشاركة غير متاحة');await Sharing.shareAsync(file.uri,{mimeType:'text/markdown'});}
    catch{Alert.alert('تعذّر التصدير','لم تُحذف المسودة. حاول مجددًا.');}
  }
  async function exportDatabaseRescue(){
    if(!db||actionLock.current)return;actionLock.current=true;setSaving(true);
    try{const copy=await createDatabaseSnapshot(db,Paths.cache.uri);if(!(await Sharing.isAvailableAsync()))throw new Error('المشاركة غير متاحة');await Sharing.shareAsync(copy.uri,{mimeType:'application/vnd.sqlite3'});}
    catch(error){Alert.alert('تعذّر إنشاء نسخة الإنقاذ',String(error));}finally{actionLock.current=false;setSaving(false);}
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
  function assertNoDraftForRestore() {
    const current = restoreDraftState.current;
    const sessions=sessionRef.current;
    for(const item of [sessions.sourceDraft,sessions.cardDraft,sessions.aiSession]){
      if(item.loading||item.status==='saving'||item.status==='error')throw new Error('تحقق من حفظ مسودات المصدر والبطاقة والذكاء من الرئيسية قبل الاستعادة. لم تُستبدل بيانات الدراسة.');
      if(item.getCurrent())throw new Error('لديك مسودة مصدر أو بطاقة أو ذكاء. افتحها واحفظها أو صدّرها وتحقق من الملف ثم تجاهلها صراحة قبل الاستعادة.');
    }
    if (current.loading || current.status === 'saving') {
      throw new Error('انتظر اكتمال تحميل المسودة أو حفظها قبل الاستعادة. لم تُستبدل بيانات الدراسة.');
    }
    if (current.status === 'error') {
      throw new Error('تعذّر التحقق من المسودة. أعد فتح التطبيق لمحاولة قراءتها قبل الاستعادة؛ لم تُستبدل بيانات الدراسة ولم تُحذف المسودة.');
    }
    if (current.editorOpen || current.cardEditorOpen || current.retained) {
      throw new Error('قبل الاستعادة، احفظ الملاحظة أو البطاقة وأغلق المحرر. للمسودة: احفظها كملاحظة، أو صدّرها وتأكد من وجود الملف ثم اختر تجاهل المسودة صراحة من الرئيسية. أعد المحاولة بعد ذلك؛ لم تُستبدل بيانات الدراسة.');
    }
  }
  async function replaceStudy(restore: (d: Database) => Promise<void>): Promise<boolean> {
    return action(async d => {
      assertNoDraftForRestore();
      // Do not trust a recoveredDraft captured before a picker or an old alert.
      // actionLock prevents opening an editor while this commit-time read waits.
      let storedDraft: string | null;
      try { storedDraft = await getSetting(d, NOTE_DRAFT_KEY); }
      catch { throw new Error('تعذّر قراءة المسودة المحفوظة. أعد المحاولة بعد التأكد من إمكانية فتحها؛ لم تُستبدل بيانات الدراسة.'); }
      assertNoDraftForRestore();
      // Any non-null or corrupt entry is protected, not silently discarded.
      if (storedDraft !== null && storedDraft.trim() !== 'null') {
        throw new Error('توجد مسودة محفوظة. افتحها من الرئيسية واحفظها كملاحظة، أو صدّرها وتأكد من وجود الملف ثم اختر تجاهل المسودة صراحة. بعدها أعد الاستعادة؛ لم تُستبدل بيانات الدراسة ولم تُحذف المسودة.');
      }
      for(const key of [SOURCE_DRAFT_KEY,CARD_DRAFT_KEY,AI_STUDY_SESSION_KEY]){
        const raw=await getSetting(d,key);assertNoDraftForRestore();
        if(raw!==null&&raw.trim()!=='null')throw new Error('توجد مسودة دراسة محفوظة. احفظها أو صدّرها ثم تجاهلها صراحة قبل الاستعادة.');
      }
      await restore(d);
      stopDraftTimer();
      // There is no draft to clear. A restore must never write a draft tombstone.
      setRevealedId(null); setQuizOpen(false); setEditorOpen(false); setCardEditorNoteId(null);
    });
  }
  async function restorePortableStudy(backup: Backup): Promise<boolean> {
    return replaceStudy(d => restoreBackup(d, backup));
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
          { text: 'استعادة', onPress: () => { void replaceStudy(d => restoreRecoveryPoint(d, point.id)).then(resolve); } },
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
          { text: 'استبدال', style: 'destructive', onPress: () => void replaceStudy(d => restoreBackup(d, backup)) },
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
      {afterSave&&notes.some(n=>n.id===afterSave.id)&&<Panel p={p}>
        <Label p={p} weight="700">حُفظت المادة: {afterSave.title}</Label>
        <Label p={p} size={13} color={p.muted}>اختر خطوتك التالية. يمكنك العودة إلى المادة من الملاحظات.</Label>
        <Button p={p} title="إضافة سؤال وإجابة" onPress={()=>void openCardEditor(afterSave.id)}/>
        {cards.some(c=>c.noteId===afterSave.studyNoteId)&&<Button p={p} title="تدريب من هذه المادة" onPress={()=>startQuiz(afterSave.studyNoteId)}/>}
        <Button p={p} title="إخفاء الخطوة التالية" tone="plain" onPress={()=>setAfterSave(null)}/>
      </Panel>}
      {(sourceDraft.value||sourceDraft.status==='error')&&<Panel p={p}>
        <Label p={p} weight="700">أكمل مادة الدراسة</Label><Button p={p} title="متابعة إضافة المادة" onPress={()=>setTab('sources')}/>
        <Button p={p} title="تصدير مسودة المصدر" disabled={!sourceDraft.value} tone="plain" onPress={()=>void exportRecoveryText(JSON.stringify(sourceDraft.value,null,2),'مسودة مصدر')}/>
        <Button p={p} title="تجاهل مسودة المصدر" tone="plain" onPress={()=>Alert.alert('تجاهل مسودة المصدر؟','لا تُحذف الملاحظات المحفوظة.',[{text:'إلغاء',style:'cancel'},{text:'تجاهل',style:'destructive',onPress:()=>void sourceDraft.clear()}])}/>
      </Panel>}
      {(cardDraft.value||cardDraft.status==='error')&&<Panel p={p}>
        <Label p={p} weight="700">أكمل مسودة البطاقة</Label><Button p={p} title="استعادة مسودة البطاقة" onPress={()=>cardDraft.status==='error'&&!cardDraft.value?cardDraft.retry():resumeCardDraft()}/>
        <Button p={p} title="تصدير البطاقة غير المحفوظة" disabled={!cardDraft.value} tone="plain" onPress={()=>void exportRecoveryText(JSON.stringify(cardDraft.value,null,2),'مسودة بطاقة')}/>
        <Button p={p} title="تجاهل مسودة البطاقة" tone="plain" onPress={()=>Alert.alert('تجاهل مسودة البطاقة؟','تبقى البطاقة المنشورة وسجلها كما هما.',[{text:'إلغاء',style:'cancel'},{text:'تجاهل',style:'destructive',onPress:()=>void cardDraft.clear()}])}/>
      </Panel>}
      {(aiSession.hasPending||aiSession.status==='error')&&<Panel p={p}>
        <Label p={p} weight="700">أكمل مسودة المساعد</Label><Button p={p} title="متابعة مساعد الدراسة" onPress={()=>setTab('ai')}/>
        <Button p={p} title="تصدير مسودة المساعد" disabled={!aiSession.value} tone="plain" onPress={()=>void exportRecoveryText(JSON.stringify(aiSession.getCurrent(),null,2),'مسودة المساعد')}/>
        <Button p={p} title="تجاهل مسودة المساعد" tone="plain" onPress={()=>Alert.alert('تجاهل مسودة المساعد؟','تبقى الملاحظات التي حفظتها كما هي.',[{text:'إلغاء',style:'cancel'},{text:'تجاهل',style:'destructive',onPress:()=>void aiSession.clear()}])}/>
      </Panel>}
      <StudyHome p={p} workspace={workspace} notes={notes} cardsCount={cards.length} dueCount={due.length}
        todayReviewed={todayReviewed} linksCount={links.length} onCustomize={() => setCustomizing(true)}
        onTools={() => setTab('tools')} onModule={openModule} onOpenNote={openNote} onNewNote={openNew} />
    </View>;
  }

  function toolsScreen(){return <ToolsScreen p={p} workspace={workspace} onSaveWorkspace={saveWorkspace} onOpen={openModule}/>;}
  function sourcesScreen() {
    if(sourceDraft.loading)return <Label p={p}>جارٍ استعادة مادة الدراسة…</Label>;
    if(sourceDraft.status==='error'&&!sourceDraft.value)return <Panel p={p}><Label p={p}>تعذّر قراءة مسودة المصدر. لم نستبدلها بنص فارغ.</Label><Button p={p} title="إعادة قراءة مسودة المصدر" onPress={sourceDraft.retry}/></Panel>;
    return <View style={{gap:12}}>
      <Label p={p} size={12} color={sourceDraft.status==='error'?p.danger:p.muted}>{sourceDraft.status==='saving'?'جارٍ حفظ مسودة المصدر…':sourceDraft.status==='error'?'تعذّر حفظ المصدر؛ النص باقٍ هنا. أعد المحاولة أو صدّره.':'مسودة المصدر تحفظ على هذا الجهاز'}</Label>
      {sourceDraft.status==='error'&&<Button p={p} title="إعادة حفظ المصدر" onPress={()=>void sourceDraft.flush()}/>}
      <SourcesWorkbench p={p} notes={notes} initialDraft={sourceDraft.value} onFormChange={value=>{if(sourceHasContent(value))sourceDraft.update(value);else if(sourceDraft.getCurrent())sourceDraft.update(null);}}
        onImportText={() => void importSource()} onDraft={value=>beginEditor({editingId:null,...value})} />
    </View>;
  }
  function aiScreen() {
    return <AIWorkspace session={aiSession} p={p} notes={notes} onDraft={value => {const source=notes.find(n=>n.id===value.sourceNoteId);beginEditor({editingId:null,title:value.title,body:value.body,...(source?{sourceNote:{id:source.id,createdAt:source.createdAt,updatedAt:source.updatedAt}}:{})});}} />;
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
        <Label p={p} size={12} color={p.muted}>يشمل البحث عناوين الملاحظات ومحتواها.</Label>
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
        {revealedId === current.id && <Label p={p} size={12} color={p.muted}>{notes.find(n => n.id === current.noteId)?.title ?? 'بطاقة'}</Label>}
        <Label p={p} size={23} weight="700" style={{ marginVertical: 17 }}>{current.question}</Label>
        {revealedId === current.id ? <View style={{ gap: 12 }}>
          <View style={{ backgroundColor: p.subtle, padding: 17, borderRadius: 15 }}>
            <Label p={p} size={17}>{current.answer}</Label>
          </View>
          <Label p={p} size={12} color={p.muted}>لم أتذكر: الإجابة لم تحضر. صعب: تذكّرتها بتردد. جيد أو سهل: تذكّرتها بثقة.</Label>
          <View style={{ flexDirection: arabicRow, flexWrap: 'wrap', gap: 7 }}>
            {([['again','لم أتذكر'],['hard','صعب'],['good','جيد'],['easy','سهل']] as [Grade,string][]).map(([grade,label]) =>
              <Button key={grade} p={p} title={label} tone={grade === 'good' ? 'primary' : 'secondary'}
                compact disabled={saving} onPress={() => void review(current,grade)} style={{ flexGrow: 1 }} />)}
          </View>
        </View> : <Button title="إظهار الإجابة" p={p} onPress={() => setRevealedId(current.id)} />}
      </Panel> : <Panel p={p}>
        <Empty p={p} title={cards.length ? 'لا توجد بطاقات مستحقة الآن' : 'ابدأ ببطاقتك الأولى'}
          detail={cards.length ? 'بطاقاتك محفوظة. يمكنك عرضها أو العودة عند موعدها.' : 'أنشئ ملاحظة، ثم أضف سؤالًا وإجابة لتراجعهما هنا.'} />
        <Button p={p} title="إنشاء بطاقات من الملاحظات" tone="secondary" onPress={() => setTab('notes')} />
      </Panel>}
      {current && notes.some(n => n.id === current.noteId) && <Button p={p} title="فتح الملاحظة الأصلية" tone="plain" onPress={() => openNote(notes.find(n => n.id === current.noteId)!)} />}
      <Button title="تدريب استرجاع ذاتي" p={p} tone="secondary" icon="checkmark.circle" onPress={()=>startQuiz()} />
      <Button p={p} title={showCards ? 'إخفاء إدارة البطاقات' : `إدارة البطاقات (${cards.length})`} tone="plain" onPress={() => setShowCards(v => !v)} />
      {showCards && cards.map(c => <Panel key={c.id} p={p} style={{ padding: 14, gap: 8 }}>
        <Label p={p} size={14} weight="700">{c.question}</Label>
        <Label p={p} size={13} color={p.muted}>{c.answer}</Label>
        <View style={{ flexDirection: arabicRow, justifyContent: 'space-between', alignItems: 'center' }}>
          <Label p={p} size={12} color={p.muted}>{c.dueAt <= clock ? 'مستحقة الآن' : `قادمة: ${new Date(c.dueAt).toLocaleDateString('ar-SA')}`}</Label>
          <Button p={p} title="تعديل" accessibilityLabel={`تعديل ${c.question}`} compact tone="secondary" onPress={()=>void openCardEditor(c.noteId,c)} /><Button title="حذف" p={p} compact tone="danger" onPress={() => confirmCardDelete(c)} />
        </View>
      </Panel>)}
    </View>;
  }
  function graphScreen() { return <View style={{ gap: 15 }}>
    {header('شبكة أفكاري', `${notes.length} عقدة · ${links.length} علاقة`)}
    <KnowledgeGraph notes={notes} p={p} onOpen={openNote} session={graphSession} onSessionChange={setGraphSession} />
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
    <Panel p={p}><Label p={p} weight="700">نسخة إنقاذ قاعدة البيانات</Label>
      <Label p={p} size={13} color={p.muted}>ملف SQLite يشمل الدراسة والمسودات والإعدادات ونقاط الرجوع حتى 512 MiB، دون الصور والصوت. للاسترداد التقني؛ لا يدعم التطبيق استيراده حاليًا. استخدمه إذا تجاوزت مكتبتك حد JSON.</Label>
      <Button p={p} title="تصدير نسخة إنقاذ SQLite" tone="secondary" disabled={saving} onPress={()=>void exportDatabaseRescue()}/></Panel>
    {db && <RecoveryPointsPanel db={db} p={p} disabled={saving || dataStale} onRestore={restorePoint} />}
    {db && <PortableBackupPanel p={p} disabled={saving || dataStale} getSnapshot={capturePortableSnapshot}
      restoreStudy={restorePortableStudy} applyPreferences={applyPortablePreferences} />}
    <Panel p={p}>
      <Label p={p} weight="700">عن النسخة</Label>
      <Label p={p} size={13} color={p.muted}>رُسوخ 0.5.2 — مساحة تبدأ فارغة، ومسودات قابلة للاستئناف، وتدريب استرجاع ذاتي. مساعد الدراسة المحلي تجريبي ويحتاج مراجعة النتائج. جدولة المراجعة مبسطة وليست FSRS. لا مزامنة سحابية.</Label>
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

    {customizing && <WorkspaceEditor reducedMotion={reducedMotion} value={workspace} p={p} onCancel={() => setCustomizing(false)} onSave={async next=>{const ok=await saveWorkspace(next);if(ok)setCustomizing(false);return ok;}} />}

    <Modal visible={editorOpen} animationType={reducedMotion ? "none" : "slide"} presentationStyle="pageSheet" onRequestClose={closeNote}>
      <SafeAreaView style={{ flex: 1, backgroundColor: p.bg }}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 20, gap: 17 }}>
            {modalHeader(editingId ? 'تعديل الملاحظة' : 'ملاحظة جديدة', closeNote)}
            <Label p={p} size={12} color={draft.status === 'error' ? p.danger : p.muted}>{draft.status === 'saved' && draft.recoveredDraft?.editingId === editingId && draft.recoveredDraft?.title === draftTitle && draft.recoveredDraft?.body === draftBody ? 'مسودة محفوظة على جهازك' : draft.status === 'saving' ? 'جارٍ حفظ المسودة…' : draft.status === 'error' ? 'تعذّر حفظ المسودة؛ احفظ الملاحظة أو صدّر النص' : 'التعديلات تُحفظ كمسودة محلية'}</Label>
            <Field p={p} label="العنوان" maxLength={160} editable={!saving} value={draftTitle} onChangeText={setDraftTitle} placeholder="اختياري — نأخذه من أول سطر" />
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
          <Label p={p} size={13} color={p.muted}>فكرة واحدة لكل بطاقة. مثال: ما السبب الرئيسي لحدوث الظاهرة؟ احتفظ بالشرح الطويل في الملاحظة.</Label>
          <Field p={p} label="السؤال" maxLength={MAX_NOTE_CHARS} editable={!saving} value={question} onChangeText={setQuestion} placeholder="ماذا تريد أن تتذكر؟" />
          <Field p={p} label="الإجابة" maxLength={MAX_NOTE_CHARS} editable={!saving} value={answer} onChangeText={setAnswer} multiline placeholder="الإجابة المختصرة" />
          <Label p={p} size={12} color={cardDraft.status==='error'?p.danger:p.muted}>{cardDraft.status==='error'?'تعذّر حفظ المسودة. النص باقٍ هنا؛ احفظ البطاقة أو صدّرها.':cardDraft.status==='saving'?'جارٍ حفظ المسودة…':'مسودة البطاقة تحفظ محليًا'}</Label>
          <Button p={p} title="تصدير مسودة البطاقة" tone="plain" onPress={()=>void exportRecoveryText(`س: ${question}\nج: ${answer}`,'مسودة بطاقة')}/>
          <Button p={p} title={editingCardId?"حفظ تعديل البطاقة":"إنشاء البطاقة"} onPress={() => void commitCard()} disabled={saving} />
        </ScrollView></KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>

    {quizOpen && <Modal visible animationType={reducedMotion?'none':'slide'} presentationStyle="pageSheet" onRequestClose={()=>setQuizOpen(false)}>
      <SafeAreaView style={{flex:1,backgroundColor:p.bg}}>
        <View style={{flex:1,display:quizSourceNote?'none':'flex'}} accessibilityElementsHidden={!!quizSourceNote} importantForAccessibility={quizSourceNote?'no-hide-descendants':'auto'}>
          <StudyQuiz key={quizSession} p={p} cards={practiceNoteId?cards.filter(c=>c.noteId===practiceNoteId):cards} notes={notes}
            onClose={()=>setQuizOpen(false)} onOpenNote={setQuizSourceNote}
            onAddMaterial={()=>{setQuizOpen(false);setTab('sources');}} onNewNote={()=>{setQuizOpen(false);openNew();}}/>
        </View>
        {quizSourceNote&&<ScrollView contentContainerStyle={{padding:22,gap:16}}><Button p={p} title="العودة إلى التدريب" onPress={()=>setQuizSourceNote(null)}/><Label p={p} size={23} weight="700">{quizSourceNote.title}</Label><Label p={p}>{quizSourceNote.body}</Label></ScrollView>}
      </SafeAreaView>
    </Modal>}

  </SafeAreaView>;
}

export default function App() {
  return <SafeAreaProvider><RecoveryBoundary><AppContent /></RecoveryBoundary></SafeAreaProvider>;
}
