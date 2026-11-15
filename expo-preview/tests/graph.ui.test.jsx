import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { KnowledgeGraph } from '../src/KnowledgeGraph';
import { light } from '../src/ui';

jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('react-native-svg', () => {
  const { View, Text } = require('react-native');
  return { __esModule: true, default: View, Circle: View, G: View, Line: View, Text };
});
const notes = [
  { id: 'a', title: 'الفكرة الأولى', body: 'ترتبط بـ [[الفكرة الثانية]]', createdAt: 1, updatedAt: 1 },
  { id: 'b', title: 'الفكرة الثانية', body: '', createdAt: 1, updatedAt: 1 },
];

test('initial overview fits the measured viewport and follows size changes', async () => {
  await render(<KnowledgeGraph notes={notes} p={light} onOpen={() => {}} />);
  await fireEvent(screen.getByTestId('graph-viewport'), 'layout', { nativeEvent: { layout: { width: 250, height: 200, x: 0, y: 0 } } });
  expect(screen.getByTestId('graph-canvas').props.width).toBeCloseTo(250);
  expect(screen.getByTestId('graph-canvas').props.height).toBeCloseTo(250 * 540 / 680);
  await fireEvent(screen.getByTestId('graph-viewport'), 'layout', { nativeEvent: { layout: { width: 320, height: 250, x: 0, y: 0 } } });
  expect(screen.getByTestId('graph-canvas').props.width).toBeCloseTo(320);
  await fireEvent(screen.getByTestId('graph-viewport'), 'layout', { nativeEvent: { layout: { width: 800, height: 405, x: 0, y: 0 } } });
  expect(screen.getByTestId('graph-canvas').props.height).toBeLessThanOrEqual(405);
});

test('zoom is relative to the fitted overview and reset restores the full graph', async () => {
  await render(<KnowledgeGraph notes={notes} p={light} onOpen={() => {}} />);
  await fireEvent(screen.getByTestId('graph-viewport'), 'layout', { nativeEvent: { layout: { width: 250, height: 200, x: 0, y: 0 } } });
  await fireEvent.press(screen.getByRole('button', { name: 'تكبير الشبكة' }));
  expect(screen.getByTestId('graph-canvas').props.width).toBeCloseTo(300);
  await fireEvent.press(screen.getByRole('button', { name: 'ملاءمة الشبكة' }));
  expect(screen.getByTestId('graph-canvas').props.width).toBeCloseTo(250);
  expect(screen.queryByRole('button', { name: 'ملاءمة الشبكة' })).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'تصغير الشبكة' }));
  expect(screen.getByTestId('graph-canvas').props.width).toBeCloseTo(200);
});

test('text relationship list opens the target independently of canvas zoom', async () => {
  const onOpen = jest.fn();
  await render(<KnowledgeGraph notes={notes} p={light} onOpen={onOpen} />);
  await fireEvent.press(screen.getByRole('button', { name: 'فتح الفكرة الثانية المرتبطة بـ الفكرة الأولى' }));
  expect(onOpen).toHaveBeenCalledWith(notes[1]);
});

const manyNotes = Array.from({ length: 25 }, (_, i) => ({
  id: `n${i}`, title: i === 24 ? 'ملاحظة أخيرة' : `ملاحظة ${i + 1}`,
  body: i === 0 ? '[[ملاحظة أخيرة]]' : '', createdAt: 1, updatedAt: 1,
}));

test('all notes can be paged while the canvas remains bounded to 24 nodes', async () => {
  await render(<KnowledgeGraph notes={manyNotes} p={light} onOpen={() => {}} />);
  expect(screen.getAllByTestId(/^graph-node-/)).toHaveLength(24);
  expect(screen.queryByTestId('graph-node-n24')).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'صفحة الملاحظات التالية' }));
  expect(screen.getAllByTestId(/^graph-node-/)).toHaveLength(1);
  expect(screen.getByTestId('graph-node-n24')).toBeTruthy();
  expect(screen.getByText('الملاحظات 25–25 من 25')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'صفحة الملاحظات السابقة' }));
  expect(screen.getByTestId('graph-node-n0')).toBeTruthy();
});

test('Arabic title search finds an offscreen isolated note and opens it', async () => {
  const onOpen = jest.fn();
  await render(<KnowledgeGraph notes={manyNotes.map(n => ({ ...n, body: '' }))} p={light} onOpen={onOpen} />);
  await fireEvent.changeText(screen.getByLabelText('ابحث في جميع عناوين الملاحظات'), 'اخيرة');
  expect(screen.getAllByTestId(/^graph-node-/)).toHaveLength(1);
  await fireEvent.press(screen.getByRole('button', { name: 'عرض الملاحظات كقائمة' }));
  await fireEvent.press(screen.getByRole('button', { name: 'فتح ملاحظة أخيرة من قائمة الشبكة' }));
  expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: 'n24' }));
});

test('cross-page relationships remain discoverable in both directions', async () => {
  const onOpen = jest.fn();
  await render(<KnowledgeGraph notes={manyNotes} p={light} onOpen={onOpen} />);
  await fireEvent.press(screen.getByRole('button', { name: 'فتح ملاحظة أخيرة المرتبطة بـ ملاحظة 1' }));
  expect(onOpen).toHaveBeenLastCalledWith(manyNotes[24]);
  await fireEvent.press(screen.getByRole('button', { name: 'صفحة الملاحظات التالية' }));
  await fireEvent.press(screen.getByRole('button', { name: 'فتح ملاحظة 1 المرتبطة بـ ملاحظة أخيرة' }));
  expect(onOpen).toHaveBeenLastCalledWith(manyNotes[0]);
});

test('filtering a title retains incoming relationships from notes outside the search', async () => {
  const onOpen = jest.fn();
  await render(<KnowledgeGraph notes={manyNotes} p={light} onOpen={onOpen} />);
  await fireEvent.changeText(screen.getByLabelText('ابحث في جميع عناوين الملاحظات'), 'اخيرة');
  expect(screen.getAllByTestId(/^graph-node-/)).toHaveLength(1);
  await fireEvent.press(screen.getByRole('button', { name: 'فتح ملاحظة 1 المرتبطة بـ ملاحظة أخيرة' }));
  expect(onOpen).toHaveBeenCalledWith(manyNotes[0]);
});

test('no-result search can be cleared and resets to the first page', async () => {
  await render(<KnowledgeGraph notes={manyNotes} p={light} onOpen={() => {}} />);
  await fireEvent.press(screen.getByRole('button', { name: 'صفحة الملاحظات التالية' }));
  await fireEvent.changeText(screen.getByLabelText('ابحث في جميع عناوين الملاحظات'), 'غير موجودة');
  expect(screen.getByText('لا توجد نتائج')).toBeTruthy();
  expect(screen.queryByTestId('graph-canvas')).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'مسح بحث الشبكة' }));
  expect(screen.getByTestId('graph-node-n0')).toBeTruthy();
  expect(screen.getAllByTestId(/^graph-node-/)).toHaveLength(24);
});

test('deleting notes clamps an invalid page instead of leaving a blank graph', async () => {
  const view = await render(<KnowledgeGraph notes={manyNotes} p={light} onOpen={() => {}} />);
  await fireEvent.press(screen.getByRole('button', { name: 'صفحة الملاحظات التالية' }));
  await view.rerender(<KnowledgeGraph notes={manyNotes.slice(0, 2)} p={light} onOpen={() => {}} />);
  expect(screen.getByText('الملاحظات 1–2 من 2')).toBeTruthy();
  expect(screen.getByTestId('graph-node-n0')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'صفحة الملاحظات التالية' })).toBeNull();
});

test('large relationship lists are paged and include links beyond the canvas', async () => {
  const linked = Array.from({ length: 31 }, (_, i) => ({ id: `r${i}`, title: `موضوع ${i}`, body: '', createdAt: 1, updatedAt: 1 }));
  linked[0].body = linked.slice(1).map(n => `[[${n.title}]]`).join(' ');
  const onOpen = jest.fn();
  await render(<KnowledgeGraph notes={linked} p={light} onOpen={onOpen} />);
  expect(screen.getAllByTestId(/^graph-relation-/)).toHaveLength(24);
  expect(screen.getByText('علاقات هذه الصفحة: 30 من إجمالي 30 علاقة')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'صفحة العلاقات التالية' }));
  expect(screen.getAllByTestId(/^graph-relation-/)).toHaveLength(6);
  await fireEvent.press(screen.getByRole('button', { name: 'فتح موضوع 30 المرتبطة بـ موضوع 0' }));
  expect(onOpen).toHaveBeenCalledWith(linked[30]);
});
