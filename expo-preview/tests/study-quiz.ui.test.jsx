import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react-native';
import { StudyQuiz } from '../src/StudyQuiz';
import { light } from '../src/ui';

jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
const mockButtonHandlers = new Map();
jest.mock('../src/ui', () => {
  const actual = jest.requireActual('../src/ui');
  return { ...actual, Button: props => {
    mockButtonHandlers.set(props.title, props.onPress);
    return <actual.Button {...props} />;
  } };
});
beforeEach(() => mockButtonHandlers.clear());
const note = { id: 'n1', title: 'درس الأعداد', body: '', createdAt: 1, updatedAt: 1 };
const card = { id: 'c1', noteId: 'n1', question: 'اذكر عددًا أوليًا', answer: '2', dueAt: 0, intervalDays: 0, ease: 2.5, repetitions: 0, updatedAt: 0 };
const props = (cards = [card]) => ({ p: light, cards, notes: [note], onClose: jest.fn(), onOpenNote: jest.fn(), onAddMaterial: jest.fn(), onNewNote: jest.fn() });
const press = async name => fireEvent.press(screen.getByRole('button', { name }));
// Instrument the real Button without replacing its RN rendering or events.
// Host instances in RN 0.88 keep Pressability callbacks outside host props.
const pressCallback = name => mockButtonHandlers.get(name);

test('S002: recall precedes reveal and only the learner assesses correctness', async () => {
  const p = props(); await render(<StudyQuiz {...p} />);
  expect(screen.getByText('تدريب الاسترجاع')).toBeTruthy();
  expect(screen.getByText(/تقييم ذاتي/)).toBeTruthy();
  expect(screen.queryByText('2')).toBeNull();
  expect(screen.queryByRole('button', { name: 'تذكرت' })).toBeNull();
  await press('إظهار الإجابة');
  expect(screen.getByText('2')).toBeTruthy();
  expect(screen.getByText(/قد توجد إجابات صحيحة أخرى/)).toBeTruthy();
  await press('تذكرت'); await press('عرض الملخص');
  expect(screen.getByText('تذكرت: 1 من 1')).toBeTruthy();
  expect(p.cards[0]).toEqual(card);
});

test('S007: empty practice offers working material and new-note paths immediately', async () => {
  const p = props([]); await render(<StudyQuiz {...p} />);
  expect(screen.getByText('ابدأ بمادة تريد تعلّمها')).toBeTruthy();
  await press('إضافة مادة'); expect(p.onAddMaterial).toHaveBeenCalledTimes(1);
  await press('كتابة ملاحظة'); expect(p.onNewNote).toHaveBeenCalledTimes(1);
  await press('إغلاق التدريب'); expect(p.onClose).toHaveBeenCalledTimes(1);
});

test('S008: results retain missed answer and open its latest source after parent rerenders', async () => {
  const p = props(); const ui = await render(<StudyQuiz {...p} />);
  await press('إظهار الإجابة'); await press('لم أتذكر'); await press('عرض الملخص');
  expect(screen.getByText('تذكرت: 0 من 1')).toBeTruthy();
  expect(screen.getByText('لم أتذكر: 1')).toBeTruthy();
  expect(screen.getByText(card.question)).toBeTruthy();
  expect(screen.getByText(card.answer)).toBeTruthy();
  const latest = {...note, title:'عنوان مصحح', updatedAt:2};
  await ui.rerender(<StudyQuiz {...p} cards={[{...card, question:'سؤال محرر', answer:'إجابة محررة'}]} notes={[latest]} />);
  expect(screen.getByText(card.question)).toBeTruthy();
  expect(screen.queryByText('سؤال محرر')).toBeNull();
  await press('فتح المصدر: عنوان مصحح'); expect(p.onOpenNote).toHaveBeenCalledWith(latest);
  expect(screen.getByText('تذكرت: 0 من 1')).toBeTruthy();
});

test('S002/S008: repeated grade callbacks cannot award two credits or skip a card', async () => {
  const p = props(); await render(<StudyQuiz {...p} />);
  await press('إظهار الإجابة');
  const grade = pressCallback('تذكرت');
  await act(() => { grade(); grade(); });
  await press('عرض الملخص');
  expect(screen.getByText('تذكرت: 1 من 1')).toBeTruthy();
  expect(screen.getAllByText(card.question)).toHaveLength(1);
});

test('S008: missing source does not crash and a new session is explicit', async () => {
  const p = props(); const ui = await render(<StudyQuiz {...p} notes={[]} />);
  await press('إظهار الإجابة'); await press('لم أتذكر'); await press('عرض الملخص');
  expect(screen.getByText('الملاحظة المصدرية غير متاحة')).toBeTruthy();
  expect(screen.queryByRole('button', { name: /فتح المصدر/ })).toBeNull();
  await ui.rerender(<StudyQuiz {...p} cards={[{...card, id:'c2', question:'سؤال جديد'}]} />);
  expect(screen.getByText(card.question)).toBeTruthy();
  await press('جلسة جديدة');
  expect(screen.getByText('سؤال جديد')).toBeTruthy();
  expect(screen.queryByText(card.answer)).toBeNull();
});

test('S007: adding the first card does not reshuffle state and permits an explicit start', async () => {
  const p = props([]); const ui = await render(<StudyQuiz {...p} />);
  await ui.rerender(<StudyQuiz {...p} cards={[card]} />);
  await press('بدء التدريب');
  expect(screen.getByText(card.question)).toBeTruthy();
});

test('S002/S008: rerenders and stale handlers cannot replace or grade the next prompt', async () => {
  const random = jest.spyOn(Math, 'random').mockReturnValue(0.999);
  try {
    const second = {...card, id:'c2', question:'السؤال الثاني', answer:'الجواب الثاني'};
    const p = props([card, second]); const ui = await render(<StudyQuiz {...p} />);
    expect(screen.getByText(card.question)).toBeTruthy();
    await press('إظهار الإجابة'); const staleGrade = pressCallback('تذكرت');
    await press('تذكرت'); await press('السؤال التالي');
    await act(() => staleGrade());
    await ui.rerender(<StudyQuiz {...p} cards={[{...card, question:'سؤال محرر'}]} />);
    expect(screen.getByText(second.question)).toBeTruthy();
    expect(screen.queryByText(second.answer)).toBeNull();
    expect(screen.queryByRole('button', {name:'عرض الملخص'})).toBeNull();
    await press('إظهار الإجابة'); await press('لم أتذكر'); await press('عرض الملخص');
    expect(screen.getByText('تذكرت: 1 من 2')).toBeTruthy();
    await press('عرض ما لم أتذكره');
    expect(screen.queryByText(card.question)).toBeNull();
    expect(screen.getByText(second.question)).toBeTruthy();
    await press('عرض كل الإجابات'); expect(screen.getByText(card.question)).toBeTruthy();
  } finally { random.mockRestore(); }
});
