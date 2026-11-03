import React, { useState } from 'react';
import * as Native from 'react-native';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react-native';
import { ToolsScreen } from '../src/ToolsScreen';
import { defaultWorkspace, workspacePreset } from '../src/workspace';
import { light } from '../src/ui';

jest.mock('expo-symbols', () => ({ SymbolView: () => null }));

function Harness({ initial = defaultWorkspace(), save = async () => true, onOpen = jest.fn() }) {
  const [workspace, setWorkspace] = useState(initial);
  return <ToolsScreen p={light} workspace={workspace} onOpen={onOpen} onSaveWorkspace={async next => {
    const saved = await save(next);
    if (saved) setWorkspace(next);
    return saved;
  }} />;
}

test('hidden tools open without adding a section, and can be added then removed directly', async () => {
  const onOpen = jest.fn(), save = jest.fn(async () => true);
  const initial = defaultWorkspace();
  await render(<Harness initial={initial} save={save} onOpen={onOpen} />);
  await fireEvent.press(screen.getByRole('button', { name:'فتح شبكة أفكاري' }));
  expect(onOpen).toHaveBeenCalledWith('graph');
  expect(save).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole('button', { name:'إضافة شبكة أفكاري إلى مساحتي' }));
  expect(await screen.findByRole('button', { name:'إزالة شبكة أفكاري من مساحتي' })).toBeEnabled();
  expect(save.mock.calls[0][0].modules.filter(m => m.enabled).map(m => m.id)).toEqual(['graph']);
  expect(screen.getByText('أُضيف قسم شبكة أفكاري إلى مساحتك.')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name:'إزالة شبكة أفكاري من مساحتي' }));
  expect(await screen.findByRole('button', { name:'إضافة شبكة أفكاري إلى مساحتي' })).toBeEnabled();
  expect(save.mock.calls[1][0]).toEqual(initial);
  expect(initial.modules.every(m => !m.enabled)).toBe(true);
  expect(screen.getByRole('button', { name:'فتح شبكة أفكاري' })).toBeEnabled();
});

test.each(['false', 'reject'])('failed %s persistence retains saved visibility and permits retry', async failure => {
  const save = jest.fn().mockImplementationOnce(async () => {
    if (failure === 'reject') throw new Error('disk full');
    return false;
  }).mockResolvedValue(true);
  await render(<Harness initial={workspacePreset('simple')} save={save} />);
  await fireEvent.press(screen.getByRole('button', { name:'إزالة ملاحظاتي من مساحتي' }));
  expect(await screen.findByText('لم تُحفظ المساحة. بقي ترتيبك كما كان؛ حاول مرة أخرى.')).toBeTruthy();
  expect(screen.getByRole('button', { name:'إزالة ملاحظاتي من مساحتي' })).toBeEnabled();
  await fireEvent.press(screen.getByRole('button', { name:'إزالة ملاحظاتي من مساحتي' }));
  expect(await screen.findByRole('button', { name:'إضافة ملاحظاتي إلى مساحتي' })).toBeEnabled();
  expect(save).toHaveBeenCalledTimes(2);
});

test('pending edits are serialized and only a later edit uses the newly saved workspace', async () => {
  let finish;
  const save = jest.fn().mockImplementationOnce(() => new Promise(resolve => { finish=resolve; })).mockResolvedValue(true);
  const onOpen = jest.fn();
  await render(<Harness save={save} onOpen={onOpen} />);
  await fireEvent.press(screen.getByRole('button', { name:'إضافة شبكة أفكاري إلى مساحتي' }));
  expect(screen.getByText('جارٍ حفظ المساحة…')).toBeTruthy();
  expect(screen.getByRole('button', { name:'إضافة ملاحظاتي إلى مساحتي' })).toBeDisabled();
  await fireEvent.press(screen.getByRole('button', { name:'إضافة ملاحظاتي إلى مساحتي' }));
  expect(save).toHaveBeenCalledTimes(1);
  await fireEvent.press(screen.getByRole('button', { name:'فتح ملاحظاتي' }));
  expect(onOpen).toHaveBeenCalledWith('notes');
  await act(async () => { finish(true); });
  await fireEvent.press(screen.getByRole('button', { name:'إضافة ملاحظاتي إلى مساحتي' }));
  await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
  expect(save.mock.calls[1][0].modules.filter(m => m.enabled).map(m => m.id)).toEqual(['notes','graph']);
});

test('search finds hidden tools and clearing no results restores all tools', async () => {
  await render(<Harness />);
  await fireEvent.changeText(screen.getByLabelText('البحث في الأدوات'), 'PDF');
  expect(screen.getByRole('button', { name:'إضافة مصادري إلى مساحتي' })).toBeTruthy();
  expect(screen.queryByRole('button', { name:'فتح ملاحظاتي' })).toBeNull();
  await fireEvent.changeText(screen.getByLabelText('البحث في الأدوات'), 'غيرموجود');
  expect(screen.getByText('لا توجد أداة بهذا الاسم')).toBeTruthy();
  expect(screen.getByLabelText('البحث في الأدوات').props.value).toBe('غيرموجود');
  await fireEvent.press(screen.getByRole('button', { name:'مسح بحث الأدوات' }));
  expect(screen.getByRole('button', { name:'إضافة مساعد الدراسة المحلي إلى مساحتي' })).toBeTruthy();
});

test('320px enlarged-type actions use vertical groups with distinct accessible names (no iOS geometry claim)', async () => {
  const dimensions = jest.spyOn(Native, 'useWindowDimensions').mockReturnValue({ width:320,height:640,scale:2,fontScale:1.5 });
  try {
    await render(<Harness />);
    expect(screen.getByTestId('tool-actions-ai').props.style).toEqual(expect.objectContaining({ flexDirection:'column' }));
    expect(screen.getByRole('button', { name:'فتح مساعد الدراسة المحلي' })).toBeEnabled();
    expect(screen.getByRole('button', { name:'إضافة مساعد الدراسة المحلي إلى مساحتي' })).toBeEnabled();
  } finally { dimensions.mockRestore(); }
});
