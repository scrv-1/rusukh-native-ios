import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react-native';
import { WorkspaceEditor } from '../src/WorkspaceEditor';
import { defaultWorkspace } from '../src/workspace';
import { light } from '../src/ui';

jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);

function sparse() {
  const value = defaultWorkspace();
  value.modules.forEach(m => { m.enabled = ['review','sources'].includes(m.id); });
  return value;
}

test('only shown sections have movement controls and one move changes visible order', async () => {
  const onSave = jest.fn(async () => true);
  await render(<WorkspaceEditor value={sparse()} p={light} onCancel={jest.fn()} onSave={onSave} />);
  expect(screen.queryByRole('button', { name:'تقديم ملاحظاتي' })).toBeNull();
  expect(screen.getByRole('button', { name:'تقديم مراجعة اليوم' })).toBeDisabled();
  expect(screen.getByRole('button', { name:'تأخير مصادري' })).toBeDisabled();
  await fireEvent.press(screen.getByRole('button', { name:'تقديم مصادري' }));
  expect(screen.getByRole('button', { name:'تقديم مصادري' })).toBeDisabled();
  await fireEvent.press(screen.getByRole('button', { name:'حفظ مساحتي' }));
  expect(onSave.mock.calls[0][0].modules.filter(m => m.enabled).map(m => m.id)).toEqual(['sources','review']);
});

test('canceling reordered and hidden draft does not save or mutate the original', async () => {
  const value = sparse(), before = JSON.stringify(value), onSave=jest.fn(), onCancel=jest.fn();
  await render(<WorkspaceEditor value={value} p={light} onCancel={onCancel} onSave={onSave} />);
  await fireEvent.press(screen.getByRole('button', { name:'تقديم مصادري' }));
  await fireEvent(screen.getByLabelText('إظهار مصادري'), 'valueChange', false);
  await fireEvent.press(screen.getByRole('button', { name:'إلغاء التخصيص' }));
  expect(onCancel).toHaveBeenCalledTimes(1);
  expect(onSave).not.toHaveBeenCalled();
  expect(JSON.stringify(value)).toBe(before);
});

test.each(['false','reject'])('failed %s save retains reorder draft and permits cancel or retry', async failure => {
  const onSave=jest.fn().mockImplementationOnce(async () => {
    if (failure === 'reject') throw new Error('disk full');
    return false;
  }).mockResolvedValue(true), onCancel=jest.fn();
  await render(<WorkspaceEditor value={sparse()} p={light} onCancel={onCancel} onSave={onSave} />);
  await fireEvent.press(screen.getByRole('button', { name:'تقديم مصادري' }));
  await fireEvent.press(screen.getByRole('button', { name:'حفظ مساحتي' }));
  expect(await screen.findByText('لم تُحفظ التغييرات. يمكنك المحاولة مجددًا أو إلغاء التخصيص.')).toBeTruthy();
  expect(screen.getByRole('button', { name:'إلغاء التخصيص' })).toBeEnabled();
  expect(screen.getByRole('button', { name:'تقديم مصادري' })).toBeDisabled();
  await fireEvent.press(screen.getByRole('button', { name:'حفظ مساحتي' }));
  expect(onSave.mock.calls[1][0]).toEqual(onSave.mock.calls[0][0]);
});

test('pending save blocks repeated writes and cancellation until failure settles', async () => {
  let finish;
  const onSave=jest.fn(() => new Promise(resolve => { finish=resolve; })), onCancel=jest.fn();
  await render(<WorkspaceEditor value={sparse()} p={light} onCancel={onCancel} onSave={onSave} />);
  await fireEvent.press(screen.getByRole('button', { name:'حفظ مساحتي' }));
  expect(screen.getByRole('button', { name:'جارٍ حفظ المساحة…' })).toBeDisabled();
  expect(screen.getByRole('button', { name:'إلغاء التخصيص' })).toBeDisabled();
  await fireEvent.press(screen.getByRole('button', { name:'إلغاء التخصيص' }));
  await fireEvent.press(screen.getByRole('button', { name:'جارٍ حفظ المساحة…' }));
  expect(onSave).toHaveBeenCalledTimes(1);
  expect(onCancel).not.toHaveBeenCalled();
  await act(async () => { finish(false); });
  await fireEvent.press(screen.getByRole('button', { name:'إلغاء التخصيص' }));
  expect(onCancel).toHaveBeenCalledTimes(1);
});
