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
