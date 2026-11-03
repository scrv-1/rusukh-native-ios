import React, { useRef, useState } from 'react';
import { Modal, ScrollView, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StudyHome } from '../src/StudyHome';
import { ToolsScreen } from '../src/ToolsScreen';
import { StudyQuiz } from '../src/StudyQuiz';
import { WorkspaceEditor } from '../src/WorkspaceEditor';
import { KnowledgeGraph } from '../src/KnowledgeGraph';
import { arabicRow, Button, Empty, Field, Label, Panel, dark, light } from '../src/ui';
import { defaultWorkspace, ModuleId } from '../src/workspace';
import type { Note, StudyCard } from '../src/types';
import { dueCards, graphEdges, makeId, normalizeTitle, parseQuestionAnswer, replaceWikiLinks, wikiLinkTitleError } from '../src/core';

type Route = 'home' | 'tools' | 'notes' | 'sources' | 'graph' | 'cards' | 'ai';
const titles: Record<Route, string> = { home: 'مساحتي', tools: 'الأدوات', notes: 'موادي', sources: 'إضافة مادة', graph: 'شبكة أفكاري', cards: 'بطاقاتي', ai: 'مساعد الدراسة المحلي' };
const fixtures: Note[] = [
  { id: 'demo-1', title: 'التعلّم النشط', body: 'س: كيف أختبر تذكّري؟\nج: أحاول استرجاع الفكرة قبل كشف الإجابة.\n\n---\nترتبط بـ [[المراجعة المتباعدة]].', createdAt: 1, updatedAt: 3 },
  { id: 'demo-2', title: 'المراجعة المتباعدة', body: 'س: كيف أوزّع جلسات الدراسة؟\nج: أعود إلى المادة على فترات بدل جمع المراجعة في جلسة واحدة.\n\n---\nاربطها بـ [[التعلّم النشط]].', createdAt: 2, updatedAt: 2 },
  { id: 'demo-3', title: 'فكرة طويلة لاختبار التفاف العناوين العربية مع English 123', body: 'س: ما خطوات هذه التجربة؟\nج: أقرأ السؤال.\nأسترجع إجابتي.\nثم أكشف المحفوظ وأقيّم نفسي.\n\n---\nبيانات تجريبية فقط. [[التعلّم النشط]]', createdAt: 3, updatedAt: 1 },
];
const cardFrom = (noteId: string, question: string, answer: string): StudyCard => {
  const now = Date.now();
  return { id: makeId('lab-card'), noteId, question, answer, dueAt: now, intervalDays: 0, ease: 2.5, repetitions: 0, updatedAt: now };
};

/** Browser-only visual harness. No App, database, recovery, or device services. */
export default function VisualLab() {
  const [isDark, setIsDark] = useState(false);
  const [frameWidth, setFrameWidth] = useState(390);
  const [route, setRoute] = useState<Route>('home');
  const [workspace, setWorkspace] = useState(defaultWorkspace);
  const [customizing, setCustomizing] = useState(false);
  const [notes, setNotes] = useState<Note[]>([]);
  const [cards, setCards] = useState<StudyCard[]>([]);
  const [selected, setSelected] = useState<Note | null>(null);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftBody, setDraftBody] = useState('');
  const [editorError, setEditorError] = useState('');
  const [notice, setNotice] = useState('');
  const [materialTitle, setMaterialTitle] = useState('');
  const [materialBody, setMaterialBody] = useState('');
  const [quizOpen, setQuizOpen] = useState(false);
  const [quizSession, setQuizSession] = useState(0);
  const [practiceNoteId, setPracticeNoteId] = useState<string | null>(null);
  const [cardNote, setCardNote] = useState<Note | null>(null);
  const [editingCard, setEditingCard] = useState<StudyCard | null>(null);
  const [cardQuestion, setCardQuestion] = useState('');
  const [cardAnswer, setCardAnswer] = useState('');
  const [cardError, setCardError] = useState('');
  const saveLock = useRef(false);
  const cardSaveLock = useRef(false);
  const examplesLoaded = useRef(false);
  const p = isDark ? dark : light;

  function navigate(next: Route) { setQuizOpen(false); setRoute(next); setNotice(''); }
  function openNote(note: Note) {
    saveLock.current = false; setSelected(note); setDraftTitle(note.title); setDraftBody(note.body); setEditorError('');
  }
  function newNote(title = '', body = '') {
    const now = Date.now();
    openNote({ id: makeId('lab-note'), title, body, createdAt: now, updatedAt: now });
  }
  function openPractice(noteId: string | null = null) {
    setSelected(null); setPracticeNoteId(noteId); setQuizSession(value => value + 1); setQuizOpen(true); setNotice('');
  }
  function openModule(id: ModuleId) {
    if (id === 'quiz') openPractice();
    else navigate(id === 'review' ? 'cards' : id);
  }
  function loadExamples() {
    if (examplesLoaded.current) { setNotice('الأمثلة محمّلة بالفعل؛ لم نكرر موادك أو بطاقاتك.'); return; }
    examplesLoaded.current = true;
    const additions = fixtures.filter(fixture => !notes.some(note => note.id === fixture.id || normalizeTitle(note.title) === normalizeTitle(fixture.title)));
    setNotes(current => [...current, ...additions.map(note => ({ ...note }))]);
    setCards(current => [...current, ...additions.flatMap(note => parseQuestionAnswer(note.body).map(pair => cardFrom(note.id, pair.question, pair.answer)))]);
    setQuizOpen(false); setRoute('notes');
    setNotice(additions.length ? `حُمّلت ${additions.length} مواد اختيارية وبطاقاتها في ذاكرة المختبر.` : 'الأمثلة موجودة بالفعل؛ لم نكرر موادك أو بطاقاتك.');
  }
  function resetLab() {
    examplesLoaded.current = false;
    setNotes([]); setCards([]); setWorkspace(defaultWorkspace()); setSelected(null); setCardNote(null);
    setMaterialTitle(''); setMaterialBody(''); setQuizOpen(false); setCustomizing(false); setRoute('home'); setNotice('');
  }
  function saveNote(withCards: boolean) {
    if (!selected || saveLock.current) return;
    const title = draftTitle.trim() || draftBody.trim().split('\n')[0].replace(/[\[\]|]/g, ' ').slice(0, 160).trim();
    const error = !title ? 'اكتب فكرة أو عنوانًا قبل الحفظ.' : wikiLinkTitleError(title);
    if (error) { setEditorError(error); return; }
    if (notes.some(note => note.id !== selected.id && normalizeTitle(note.title) === normalizeTitle(title))) { setEditorError('اختر عنوانًا مختلفًا؛ توجد مادة بهذا العنوان.'); return; }
    if (title.length > 160 || draftBody.length > 1000000 || /\u0000/.test(title + draftBody)) { setEditorError('راجع طول النص والعنوان والمحارف غير الصالحة.'); return; }
    saveLock.current = true;
    const now = Date.now();
    const note = { ...selected, title, body: draftBody, updatedAt: now };
    const oldTitle = normalizeTitle(notes.find(item => item.id === note.id)?.title ?? '');
    const retarget = (body: string) => oldTitle ? replaceWikiLinks(body, (full, target, alias) => normalizeTitle(target) === oldTitle ? `[[${title}${alias ?? ''}]]` : full) : body;
    const saved = { ...note, body: retarget(note.body) };
    setNotes(current => [...current.filter(item => item.id !== note.id).map(item => ({ ...item, body: retarget(item.body) })), saved]);
    const pairs = withCards ? parseQuestionAnswer(saved.body) : [];
    const additions: StudyCard[] = [];
    const known = new Set(cards.filter(card => card.noteId === note.id).map(card => normalizeTitle(card.question)));
    for (const pair of pairs) {
      const key = normalizeTitle(pair.question);
      if (!known.has(key)) { additions.push(cardFrom(note.id, pair.question, pair.answer)); known.add(key); }
    }
    setCards(current => [...current, ...additions]);
    setSelected(null); setMaterialTitle(''); setMaterialBody('');
    if (!quizOpen) setRoute('notes');
    setNotice(withCards ? `حُفظت المادة وأُضيفت ${additions.length} بطاقة في الذاكرة. البطاقات الموجودة تُعدَّل من «تعديل البطاقة».` : 'حُفظت المادة في ذاكرة المختبر. يمكنك إضافة بطاقة يدويًا أو استخراج س/ج من داخلها.');
  }
  function openCard(note: Note, card?: StudyCard) {
    cardSaveLock.current = false; setCardNote(note); setEditingCard(card ?? null); setCardQuestion(card?.question ?? ''); setCardAnswer(card?.answer ?? ''); setCardError('');
  }
  function saveCard() {
    if (!cardNote || cardSaveLock.current) return;
    const question = cardQuestion.trim(), answer = cardAnswer.trim();
    if (!question || !answer) { setCardError('اكتب السؤال والإجابة أولًا.'); return; }
    if (cards.some(card => card.noteId === cardNote.id && card.id !== editingCard?.id && normalizeTitle(card.question) === normalizeTitle(question))) { setCardError('توجد بطاقة بهذا السؤال في المادة نفسها. عدّل البطاقة الموجودة.'); return; }
    cardSaveLock.current = true;
    const card = editingCard ? { ...editingCard, question, answer, updatedAt: Date.now() } : cardFrom(cardNote.id, question, answer);
    setCards(current => [...current.filter(item => item.id !== card.id), card]);
    setCardNote(null); setRoute('cards'); setNotice('حُفظت البطاقة في الذاكرة. يمكنك بدء التدريب أو فتح مصدرها.');
  }

  return <SafeAreaProvider>
    <ScrollView style={{ flex: 1, backgroundColor: '#E4E5E6' }} contentContainerStyle={{ padding: 16, alignItems: 'center', gap: 12 }}>
      <View style={{ width: '100%', maxWidth: 760, gap: 8 }}>
        <Label p={light} size={15} weight="700" role="header" style={{ textAlign: 'center' }}>مختبر بصري — مكوّنات فعلية وبيانات مؤقتة، وليس تطبيق iPhone كاملًا</Label>
        <View style={{ flexDirection: arabicRow, flexWrap: 'wrap', justifyContent: 'center', gap: 6 }}>
          <Button p={light} title="فاتح" compact tone={isDark ? 'secondary' : 'primary'} onPress={() => setIsDark(false)} />
          <Button p={light} title="داكن" compact tone={isDark ? 'primary' : 'secondary'} onPress={() => setIsDark(true)} />
          <Button p={light} title="عرض الإطار 320" compact tone={frameWidth === 320 ? 'primary' : 'secondary'} onPress={() => setFrameWidth(320)} />
          <Button p={light} title="عرض الإطار 390" compact tone={frameWidth === 390 ? 'primary' : 'secondary'} onPress={() => setFrameWidth(390)} />
          <Button p={light} title="تحميل أمثلة اختيارية" compact tone="secondary" onPress={loadExamples} />
          <Button p={light} title="بدء مختبر فارغ" compact tone="secondary" onPress={resetLab} />
        </View>
        <Label p={light} size={12} style={{ textAlign: 'center' }}>حالة الذاكرة: {notes.length} مادة · {cards.length} بطاقة. لا SQLite ولا حفظ بعد إعادة التحميل.</Label>
      </View>

      <View testID="visual-phone-frame" style={{ width: frameWidth, maxWidth: '100%', height: 760, backgroundColor: p.bg, borderRadius: 24, borderWidth: 1, borderColor: '#909399', overflow: 'hidden' }}>
        <View style={{ minHeight: 52, justifyContent: 'center', borderBottomWidth: 1, borderColor: p.border, paddingHorizontal: 20 }}>
          <Label p={p} size={18} weight="800">{quizOpen ? 'تدريب الاسترجاع' : titles[route]}</Label>
        </View>
        {quizOpen ? <StudyQuiz key={quizSession} p={p} cards={practiceNoteId ? cards.filter(card => card.noteId === practiceNoteId) : cards} notes={notes}
          onClose={() => setQuizOpen(false)} onOpenNote={openNote} onAddMaterial={() => navigate('sources')} onNewNote={() => newNote()} />
          : <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 20, gap: 16 }}>
            {notice ? <Panel p={p}><Label p={p} size={13}>{notice}</Label><Button p={p} title="إخفاء التنبيه" tone="plain" onPress={() => setNotice('')} /></Panel> : null}
            {route === 'home' ? <StudyHome p={p} workspace={workspace} notes={notes} cardsCount={cards.length} dueCount={dueCards(cards).length} todayReviewed={0}
              linksCount={graphEdges(notes).length} onCustomize={() => setCustomizing(true)} onTools={() => navigate('tools')}
              onModule={openModule} onOpenNote={openNote} onNewNote={() => newNote()} />
              : route === 'tools' ? <ToolsScreen p={p} workspace={workspace} onSaveWorkspace={async next => { setWorkspace(next); return true; }} onOpen={openModule} />
              : route === 'graph' ? <KnowledgeGraph p={p} notes={notes} onOpen={openNote} />
              : route === 'sources' ? <View style={{ gap: 16 }}>
                <Label p={p} size={23} weight="800" role="header">ابدأ بنص تريد دراسته</Label>
                <Label p={p} size={13} color={p.muted}>إدخال نص مؤقت للمحاكاة. رفع الملفات والكاميرا والصوت ومحرك PDF غير موصولة هنا.</Label>
                <Field p={p} label="عنوان المادة — اختياري" value={materialTitle} onChangeText={setMaterialTitle} maxLength={160} />
                <Field p={p} label="النص الذي تريد دراسته" multiline value={materialBody} onChangeText={setMaterialBody} placeholder="اكتب أو الصق نصك هنا" />
                <Button p={p} title="مراجعة المادة قبل الحفظ" disabled={!materialBody.trim()} onPress={() => newNote(materialTitle, materialBody)} />
              </View>
              : route === 'notes' ? <View style={{ gap: 14 }}>
                <View style={{ flexDirection: arabicRow, flexWrap: 'wrap', gap: 8 }}><Button p={p} title="إضافة مادة" onPress={() => navigate('sources')} /><Button p={p} title="ملاحظة جديدة" tone="secondary" onPress={() => newNote()} /></View>
                {!notes.length ? <Empty p={p} title="لا توجد مواد بعد" detail="أضف نصك الأول أو اختر تحميل الأمثلة من أدوات المختبر." /> : notes.map(note => <Panel key={note.id} p={p}>
                  <Label p={p} weight="700">{note.title}</Label><Label p={p} size={13} color={p.muted}>{cards.filter(card => card.noteId === note.id).length} بطاقة</Label>
                  <Button p={p} title={`فتح المادة: ${note.title}`} tone="secondary" onPress={() => openNote(note)} />
                  <Button p={p} title="إضافة بطاقة" tone="secondary" accessibilityLabel={`إضافة بطاقة إلى ${note.title}`} onPress={() => openCard(note)} />
                  <Button p={p} title="تدريب من هذه المادة" tone="plain" onPress={() => openPractice(note.id)} />
                </Panel>)}
              </View>
              : route === 'cards' ? <View style={{ gap: 14 }}>
                <Label p={p} size={13} color={p.muted}>بطاقات ذاكرة المختبر. جلسة المراجعة المجدولة في App ليست جزءًا من هذه المحاكاة.</Label>
                <Button p={p} title="تدريب استرجاع ذاتي" onPress={() => openPractice()} />
                {!cards.length ? <Empty p={p} title="لا توجد بطاقات بعد" detail="افتح مادة لإضافة بطاقة أو لحفظ س/ج مكتوبة فيها." /> : cards.map(card => {
                  const note = notes.find(item => item.id === card.noteId);
                  return <Panel key={card.id} p={p}><Label p={p} weight="700">{card.question}</Label><Label p={p}>{card.answer}</Label>
                    {note ? <><Button p={p} title={`فتح المصدر: ${note.title}`} tone="secondary" onPress={() => openNote(note)} /><Button p={p} title="تعديل البطاقة" tone="plain" onPress={() => openCard(note, card)} /></> : null}
                  </Panel>;
                })}
                <Button p={p} title="فتح موادي لإضافة بطاقة" tone="secondary" onPress={() => navigate('notes')} />
              </View>
              : <Panel p={p}><Label p={p} weight="700">المحرك المحلي خارج نطاق المختبر</Label><Label p={p} color={p.muted}>هذه المحاكاة لا تحمل نموذجًا ولا تولّد إجابات. يمكنك متابعة دورة المادة والبطاقة والتدريب بالنص الذي تكتبه.</Label><Button p={p} title="إضافة مادة نصية" onPress={() => navigate('sources')} /></Panel>}
          </ScrollView>}
        {!quizOpen && <View style={{ flexDirection: arabicRow, padding: 8, gap: 5, borderTopWidth: 1, borderColor: p.border }}>
          {(['home', 'notes', 'tools'] as const).map(tab => <Button key={tab} p={p} title={titles[tab]} compact tone={route === tab ? 'primary' : 'secondary'} selected={route === tab} style={{ flex: 1 }} onPress={() => navigate(tab)} />)}
        </View>}
      </View>
      <Label p={light} size={12} style={{ textAlign: 'center', maxWidth: 760 }}>الواجهة تعمل عبر React Native Web. لقطاتها لا تثبت أداء iPhone أو لوحة مفاتيحه أو VoiceOver أو التخزين أو الاستيراد الأصلي.</Label>
    </ScrollView>

    {customizing && <WorkspaceEditor value={workspace} p={p} onCancel={() => setCustomizing(false)} onSave={async next => { setWorkspace(next); setCustomizing(false); return true; }} />}
    <Modal visible={selected !== null} transparent animationType="none" onRequestClose={() => setSelected(null)}>
      <View style={{ flex: 1, backgroundColor: '#00000066', justifyContent: 'center', alignItems: 'center', padding: 16 }}>
        <SafeAreaView style={{ backgroundColor: p.bg, width: frameWidth, maxWidth: '100%', maxHeight: '90%', borderRadius: 20 }}>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 20, gap: 14 }}>
            <Label p={p} size={21} weight="700" role="header">مراجعة المادة في المختبر</Label>
            <Label p={p} size={12} color={p.muted}>حفظ في الذاكرة فقط. اكتب س: ثم ج: لإنشاء بطاقة. افصل المراجع اللاحقة بسطر ---.</Label>
            {editorError ? <Label p={p} color={p.danger} role="alert">{editorError}</Label> : null}
            <Field p={p} label="عنوان المادة" value={draftTitle} onChangeText={setDraftTitle} maxLength={160} />
            <Field p={p} label="محتوى المادة" multiline value={draftBody} onChangeText={setDraftBody} />
            <Label p={p} size={13} color={p.muted}>أسئلة س/ج قابلة للاستخراج: {parseQuestionAnswer(draftBody).length}</Label>
            <Button p={p} title="حفظ وإنشاء بطاقات س/ج" onPress={() => saveNote(true)} />
            <Button p={p} title="حفظ المادة فقط" tone="secondary" onPress={() => saveNote(false)} />
            <Button p={p} title={quizOpen ? 'العودة إلى التدريب دون حفظ' : 'إلغاء تحرير المادة'} tone="plain" onPress={() => setSelected(null)} />
          </ScrollView>
        </SafeAreaView>
      </View>
    </Modal>
    <Modal visible={cardNote !== null} transparent animationType="none" onRequestClose={() => setCardNote(null)}>
      <View style={{ flex: 1, backgroundColor: '#00000066', justifyContent: 'center', alignItems: 'center', padding: 16 }}>
        <SafeAreaView style={{ backgroundColor: p.bg, width: frameWidth, maxWidth: '100%', maxHeight: '90%', borderRadius: 20 }}>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 20, gap: 14 }}>
            <Label p={p} size={21} weight="700" role="header">{editingCard ? 'تعديل البطاقة في المختبر' : 'بطاقة جديدة في المختبر'}</Label>
            <Label p={p} size={13} color={p.muted}>المصدر: {cardNote?.title}</Label>
            {cardError ? <Label p={p} color={p.danger} role="alert">{cardError}</Label> : null}
            <Field p={p} label="سؤال البطاقة" value={cardQuestion} onChangeText={setCardQuestion} />
            <Field p={p} label="إجابة البطاقة" multiline value={cardAnswer} onChangeText={setCardAnswer} />
            <Button p={p} title="حفظ البطاقة" onPress={saveCard} />
            <Button p={p} title="إلغاء تحرير البطاقة" tone="secondary" onPress={() => setCardNote(null)} />
          </ScrollView>
        </SafeAreaView>
      </View>
    </Modal>
  </SafeAreaProvider>;
}
