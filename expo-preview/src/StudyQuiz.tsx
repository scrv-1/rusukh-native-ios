import React, { useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { makePracticeSession, type PracticeCard } from './core';
import type { Note, StudyCard } from './types';
import { Button, Empty, Label, Panel, type Palette } from './ui';

export type StudyQuizProps = {
  p: Palette;
  cards: readonly StudyCard[];
  notes: readonly Note[];
  onClose: () => void;
  onOpenNote: (note: Note) => void;
  onAddMaterial: () => void;
  onNewNote: () => void;
};

type Session = {
  cards: PracticeCard[];
  index: number;
  revealed: boolean;
  answers: boolean[];
  finished: boolean;
};
const start = (cards: readonly StudyCard[]): Session => ({
  cards: makePracticeSession(cards), index: 0, revealed: false, answers: [], finished: false,
});

/** Keep mounted while opening a source note to preserve the current session. */
export function StudyQuiz({ p, cards, notes, onClose, onOpenNote, onAddMaterial, onNewNote }: StudyQuizProps) {
  const [session, setSession] = useState(() => start(cards));
  const current = useRef(session);
  const [onlyMissed, setOnlyMissed] = useState(false);
  const update = (next: Session) => { current.current = next; setSession(next); };
  const restart = () => { setOnlyMissed(false); update(start(cards)); };
  const item = session.cards[session.index];
  const assessed = session.answers.length > session.index;
  const remembered = session.answers.filter(Boolean).length;
  const ready = cards.some(card => card.question.trim() && card.answer.trim());

  const assess = (didRemember: boolean) => {
    // Lock synchronously, including repeated callbacks before React rerenders.
    // A callback retained from an earlier question/session cannot grade again.
    if (current.current !== session || !session.revealed || assessed || session.finished) return;
    update({ ...session, answers: [...session.answers, didRemember] });
  };
  const next = () => {
    if (current.current !== session || !assessed || session.finished) return;
    update(session.index + 1 === session.cards.length
      ? { ...session, finished: true }
      : { ...session, index: session.index + 1, revealed: false });
  };
  const source = (card: PracticeCard) => {
    const note = notes.find(candidate => candidate.id === card.noteId);
    return note
      ? <Button p={p} tone="secondary" title={`فتح المصدر: ${note.title}`} onPress={() => onOpenNote(note)} />
      : <Label p={p} color={p.muted} size={13}>الملاحظة المصدرية غير متاحة</Label>;
  };

  return <ScrollView style={{ flex: 1, backgroundColor: p.bg }} contentContainerStyle={{ padding: 20, paddingBottom: 40, gap: 16 }}>
    <Label p={p} size={25} weight="800" role="header">تدريب الاسترجاع</Label>
    <Label p={p} color={p.muted}>تقييم ذاتي: استرجع الإجابة أولًا، ثم قارنها بالمحفوظ وقيّم تذكّرك. لا يغيّر هذا التدريب مواعيد المراجعة.</Label>
    <Button p={p} title="إغلاق التدريب" tone="plain" onPress={onClose} />

    {!session.cards.length ? <Panel p={p}>
      <Empty p={p} title="ابدأ بمادة تريد تعلّمها" detail="أضف مادة أو اكتب ملاحظة فيها سؤال وجواب، ثم احفظ بطاقاتها لتبدأ التدريب." />
      {ready ? <Button p={p} title="بدء التدريب" onPress={restart} /> : null}
      <Button p={p} title="إضافة مادة" onPress={onAddMaterial} />
      <Button p={p} title="كتابة ملاحظة" tone="secondary" onPress={onNewNote} />
    </Panel> : session.finished ? <>
      <Panel p={p}>
        <Label p={p} size={21} weight="800" role="header">ملخص تقييمي الذاتي</Label>
        <Label p={p} weight="700">تذكرت: {remembered} من {session.cards.length}</Label>
        <Label p={p}>لم أتذكر: {session.cards.length - remembered}</Label>
        <Label p={p} size={13} color={p.muted}>هذه تقديراتك في هذه الجلسة، وليست تصحيحًا آليًا. تبقى الإجابات هنا عند فتح المصدر والعودة، حتى تبدأ جلسة جديدة أو تغلق التدريب.</Label>
        <Button p={p} tone="secondary" title={onlyMissed ? 'عرض كل الإجابات' : 'عرض ما لم أتذكره'}
          selected={onlyMissed} onPress={() => setOnlyMissed(!onlyMissed)} />
      </Panel>
      {onlyMissed && remembered === session.cards.length ? <Empty p={p} title="قيّمت كل الإجابات بأنك تذكرتها" /> : null}
      {session.cards.map((card, index) => onlyMissed && session.answers[index] ? null : <Panel p={p} key={card.cardId}>
        <Label p={p} size={13} color={p.muted}>{index + 1}. {session.answers[index] ? 'تذكرت' : 'لم أتذكر'}</Label>
        <Label p={p} weight="700">{card.question}</Label>
        <Label p={p} size={13} color={p.muted}>الإجابة المحفوظة</Label>
        <Label p={p}>{card.answer}</Label>
        {source(card)}
      </Panel>)}
      <Button p={p} title="جلسة جديدة" onPress={restart} />
    </> : <Panel p={p}>
      <Label p={p} size={13} color={p.muted}>السؤال {session.index + 1} من {session.cards.length}</Label>
      <Label p={p} size={22} weight="700">{item.question}</Label>
      {!session.revealed ? <>
        <Label p={p} color={p.muted} size={14}>قل الإجابة لنفسك قبل كشفها.</Label>
        <Button p={p} title="إظهار الإجابة" onPress={() => {
          if (current.current === session) update({ ...session, revealed: true });
        }} />
      </> : <>
        <Label p={p} size={13} color={p.muted}>الإجابة المحفوظة</Label>
        <Label p={p} size={19}>{item.answer}</Label>
        <Label p={p} color={p.muted} size={13}>قد توجد إجابات صحيحة أخرى. قارن المعنى وارجع إلى المصدر عند الشك.</Label>
        {source(item)}
        {assessed ? <View accessibilityLiveRegion="polite" style={{ gap: 12 }}>
          <Label p={p} weight="700">تقييمك: {session.answers[session.index] ? 'تذكرت' : 'لم أتذكر'}</Label>
          <Button p={p} title={session.index + 1 === session.cards.length ? 'عرض الملخص' : 'السؤال التالي'} onPress={next} />
        </View> : <>
          <Button p={p} title="تذكرت" onPress={() => assess(true)} />
          <Button p={p} title="لم أتذكر" tone="secondary" onPress={() => assess(false)} />
        </>}
      </>}
    </Panel>}
  </ScrollView>;
}
