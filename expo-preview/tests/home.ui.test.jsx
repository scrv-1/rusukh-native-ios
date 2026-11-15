import React from 'react';
import * as Native from 'react-native';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { StudyHome } from '../src/StudyHome';
import { light } from '../src/ui';
import { defaultWorkspace, readWorkspace, workspacePreset } from '../src/workspace';

jest.mock('expo-symbols', () => ({ SymbolView: () => null }));

const oldNote = { id: 'old', title: 'ملاحظة سابقة', body: '', createdAt: 1, updatedAt: 1 };
const newNote = { id: 'new', title: 'آخر فكرة', body: '', createdAt: 2, updatedAt: 20 };
function props(overrides = {}) {
  return { p: light, workspace: workspacePreset('simple'), notes: [oldNote, newNote], cardsCount: 3,
    dueCount: 1, todayReviewed: 2, linksCount: 0, onCustomize: jest.fn(), onTools: jest.fn(),
    onModule: jest.fn(), onOpenNote: jest.fn(), onNewNote: jest.fn(), ...overrides };
}

test('home keeps independent entry points for study, notes and customization', async () => {
  const value = props(); await render(<StudyHome {...value} />);
  await fireEvent.press(screen.getByRole('button', { name: 'ابدأ المراجعة' }));
  expect(value.onModule).toHaveBeenCalledWith('review');
  await fireEvent.press(screen.getByRole('button', { name: 'تخصيص مساحتي' }));
  expect(value.onCustomize).toHaveBeenCalledTimes(1);
  await fireEvent.press(screen.getByRole('button', { name: 'إضافة أداة' }));
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
  await render(<StudyHome {...props({ workspace: { ...workspacePreset('simple'), density: 'compact' } })} />);
  expect(screen.queryByRole('button', { name: 'فتح آخر فكرة' })).toBeNull();
  expect(screen.getByRole('button', { name: 'فتح ملاحظاتي' })).toBeTruthy();
});

function expectOnlyBlankWorkspaceActions() {
  expect(screen.getAllByText(/.+/).map(node => node.props.children).sort()).toEqual(
    ['إضافة مادة', 'ملاحظة جديدة', 'إضافة أداة'].sort());
  expect(screen.queryAllByRole('header')).toHaveLength(0);
  expect(screen.getAllByRole('button')).toHaveLength(3);
}

test('first workspace is blank but can capture material or a note without installing sections', async () => {
  const value = props({ workspace: defaultWorkspace(), notes: [], cardsCount: 0, dueCount: 0, todayReviewed: 0 });
  await render(<StudyHome {...value} />);
  expectOnlyBlankWorkspaceActions();
  await fireEvent.press(screen.getByRole('button', { name: 'إضافة مادة' }));
  expect(value.onModule).toHaveBeenCalledWith('sources');
  await fireEvent.press(screen.getByRole('button', { name: 'ملاحظة جديدة' }));
  expect(value.onNewNote).toHaveBeenCalledTimes(1);
  expect(value.onCustomize).not.toHaveBeenCalled();
});

test('hiding all sections restores a blank canvas while keeping hidden tools recoverable', async () => {
  const workspace = workspacePreset('simple');
  workspace.modules = workspace.modules.map(item => ({ ...item, enabled: false }));
  const value = props({ workspace });
  const originalNotes = JSON.stringify(value.notes);
  await render(<StudyHome {...value} />);
  expectOnlyBlankWorkspaceActions();
  await fireEvent.press(screen.getByRole('button', { name: 'إضافة أداة' }));
  expect(value.onTools).toHaveBeenCalledTimes(1);
  expect(value.onCustomize).not.toHaveBeenCalled();
  expect(value.onModule).not.toHaveBeenCalled();
  expect(JSON.stringify(value.notes)).toBe(originalNotes);
});

test('an explicitly saved layout still shows its selected sections and recent note actions', async () => {
  const saved = workspacePreset('simple');
  saved.modules.reverse();
  const value = props({ workspace: readWorkspace(JSON.stringify(saved)) });
  await render(<StudyHome {...value} />);
  const headings = screen.getAllByRole('header').map(node => node.props.children);
  expect(headings).toEqual(['ملاحظاتي', 'مراجعة اليوم']);
  expect(screen.queryByText('مساحتي')).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'فتح آخر فكرة' }));
  expect(value.onOpenNote).toHaveBeenCalledWith(newNote);
  expect(value.workspace).toEqual(saved);
});

test('first-use and caught-up states explain the next action without invented progress', async () => {
  await render(<StudyHome {...props({ notes: [], cardsCount: 0, dueCount: 0, todayReviewed: 0 })} />);
  expect(screen.getByText('0 بطاقة مستحقة الآن')).toBeTruthy();
  expect(screen.queryByText('ابدأ بما يناسب وقتك')).toBeNull();
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

test('one compact capture bar precedes user-selected sections without fixed dashboard clutter', async () => {
  const value = props(); await render(<StudyHome {...value} />);
  const names = screen.getAllByRole('button').map(row => row.props.accessibilityLabel);
  for (const name of ['ملاحظة جديدة', 'إضافة مادة', 'إضافة أداة']) {
    expect(names.indexOf(name)).toBeGreaterThanOrEqual(0);
    expect(names.indexOf(name)).toBeLessThan(names.indexOf('ابدأ المراجعة'));
  }
  await fireEvent.press(screen.getByRole('button', { name: 'إضافة مادة' }));
  expect(value.onModule).toHaveBeenCalledWith('sources');
  expect(screen.queryByText('خطوة صغيرة اليوم. تعلّم يبقى.')).toBeNull();
  expect(screen.queryByText('راجعت اليوم 2 بطاقة')).toBeNull();
  expect(screen.queryByText('2 ملاحظة · 3 بطاقة · 2 مراجعة اليوم')).toBeNull();
  expect(screen.queryByText(/صدّر نسخة احتياطية/)).toBeNull();
  expect(screen.queryByRole('button', { name: 'كل الأدوات' })).toBeNull();
  expect(screen.getAllByRole('button', { name: 'ملاحظة جديدة' })).toHaveLength(1);
});

test('320px and enlarged type keep capture controls in a wrapping container (static, not a layout measurement)', async () => {
  const dimensions = jest.spyOn(Native, 'useWindowDimensions').mockReturnValue({ width:320,height:640,scale:2,fontScale:1.5 });
  try {
    await render(<StudyHome {...props({ workspace: defaultWorkspace() })} />);
    expectOnlyBlankWorkspaceActions();
    expect(screen.getByTestId('home-capture-actions').props.style).toEqual(expect.objectContaining({ flexWrap:'wrap' }));
  } finally { dimensions.mockRestore(); }
});

test('empty review offers card creation path instead of starting an empty session', async () => {
  const value = props({ cardsCount: 0, dueCount: 0 }); await render(<StudyHome {...value} />);
  expect(screen.queryByRole('button', { name: 'ابدأ المراجعة' })).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'أضف بطاقات من ملاحظاتك' }));
  expect(value.onModule).toHaveBeenCalledWith('notes');
});
