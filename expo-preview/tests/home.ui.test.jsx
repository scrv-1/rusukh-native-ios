import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { StudyHome } from '../src/StudyHome';
import { light } from '../src/ui';
import { defaultWorkspace } from '../src/workspace';

jest.mock('expo-symbols', () => ({ SymbolView: () => null }));

const oldNote = { id: 'old', title: 'ملاحظة سابقة', body: '', createdAt: 1, updatedAt: 1 };
const newNote = { id: 'new', title: 'آخر فكرة', body: '', createdAt: 2, updatedAt: 20 };
function props(overrides = {}) {
  return { p: light, workspace: defaultWorkspace(), notes: [oldNote, newNote], cardsCount: 3,
    dueCount: 1, todayReviewed: 2, linksCount: 0, onCustomize: jest.fn(), onTools: jest.fn(),
    onModule: jest.fn(), onOpenNote: jest.fn(), onNewNote: jest.fn(), ...overrides };
}

test('home keeps independent entry points for study, notes and customization', async () => {
  const value = props(); await render(<StudyHome {...value} />);
  await fireEvent.press(screen.getByRole('button', { name: 'ابدأ المراجعة' }));
  expect(value.onModule).toHaveBeenCalledWith('review');
  await fireEvent.press(screen.getByRole('button', { name: 'تخصيص مساحتي' }));
  expect(value.onCustomize).toHaveBeenCalledTimes(1);
  await fireEvent.press(screen.getByRole('button', { name: 'كل الأدوات' }));
  expect(value.onTools).toHaveBeenCalledTimes(1);
  await fireEvent.press(screen.getByRole('button', { name: 'ملاحظة جديدة' }));
  expect(value.onNewNote).toHaveBeenCalledTimes(1);
  expect(screen.getByText('1 بطاقة مستحقة الآن')).toBeTruthy();
});

test('recent notes follow edit time without mutating note data', async () => {
  const value = props(); await render(<StudyHome {...value} />);
  const rows = screen.getAllByRole('button').filter(row => ['فتح آخر فكرة', 'فتح ملاحظة سابقة'].includes(row.props.accessibilityLabel));
  expect(rows.map(row => row.props.accessibilityLabel)).toEqual(['فتح آخر فكرة', 'فتح ملاحظة سابقة']);
  expect(value.notes).toEqual([oldNote, newNote]);
  await fireEvent.press(rows[0]);
  expect(value.onOpenNote).toHaveBeenCalledWith(newNote);
});

test('compact view omits recent rows but keeps the notes tool', async () => {
  await render(<StudyHome {...props({ workspace: { ...defaultWorkspace(), density: 'compact' } })} />);
  expect(screen.queryByRole('button', { name: 'فتح آخر فكرة' })).toBeNull();
  expect(screen.getByRole('button', { name: 'فتح ملاحظاتي' })).toBeTruthy();
});

test('hiding all modules keeps discovery and never offers the hidden review entry', async () => {
  const workspace = defaultWorkspace(); workspace.modules = workspace.modules.map(item => ({ ...item, enabled: false }));
  const value = props({ workspace }); await render(<StudyHome {...value} />);
  expect(screen.getByText('مساحة هادئة على ذوقك')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'ابدأ المراجعة' })).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'إضافة أدوات لمساحتي' }));
  expect(value.onCustomize).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('button', { name: 'كل الأدوات' })).toBeTruthy();
});

test('first-use and caught-up states explain the next action without invented progress', async () => {
  await render(<StudyHome {...props({ notes: [], cardsCount: 0, dueCount: 0, todayReviewed: 0 })} />);
  expect(screen.getByText('0 بطاقة مستحقة الآن')).toBeTruthy();
  expect(screen.getByText('ابدأ بما يناسب وقتك')).toBeTruthy();
  expect(screen.getByText('أضف أول بطاقة من ملاحظاتك، ثم ارجع لتراجعها هنا.')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'ملاحظة جديدة' })).toBeTruthy();
});

test('muted text keeps WCAG normal-text contrast on every light content surface', () => {
  const luminance = hex => {
    const values = hex.slice(1).match(/../g).map(part => parseInt(part, 16) / 255)
      .map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
    return values[0] * .2126 + values[1] * .7152 + values[2] * .0722;
  };
  for (const background of [light.surface, light.bg, light.subtle]) {
    const a = luminance(light.muted), b = luminance(background);
    expect((Math.max(a, b) + .05) / (Math.min(a, b) + .05)).toBeGreaterThanOrEqual(4.5);
  }
});

test('capture and search are reachable before every home module', async () => {
  const value = props(); await render(<StudyHome {...value} />);
  const names = screen.getAllByRole('button').map(row => row.props.accessibilityLabel);
  for (const name of ['ملاحظة جديدة', 'إضافة مصدر', 'البحث في ملاحظاتي']) {
    expect(names.indexOf(name)).toBeGreaterThanOrEqual(0);
    expect(names.indexOf(name)).toBeLessThan(names.indexOf('ابدأ المراجعة'));
  }
  await fireEvent.press(screen.getByRole('button', { name: 'إضافة مصدر' }));
  expect(value.onModule).toHaveBeenCalledWith('sources');
  await fireEvent.press(screen.getByRole('button', { name: 'البحث في ملاحظاتي' }));
  expect(value.onModule).toHaveBeenCalledWith('notes');
});

test('empty review offers card creation path instead of starting an empty session', async () => {
  const value = props({ cardsCount: 0, dueCount: 0 }); await render(<StudyHome {...value} />);
  expect(screen.queryByRole('button', { name: 'ابدأ المراجعة' })).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'أضف بطاقات من ملاحظاتك' }));
  expect(value.onModule).toHaveBeenCalledWith('notes');
});
