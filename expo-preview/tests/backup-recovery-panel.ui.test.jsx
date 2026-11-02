import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react-native';
import { RecoveryPointsPanel } from '../src/backup/RecoveryPointsPanel';
import { listRecoveryPoints } from '../src/storage';
import { light } from '../src/ui';

jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('../src/storage', () => ({ listRecoveryPoints: jest.fn() }));

const point = (id = 1) => ({ id, schemaVersion: 1, createdAt: 1_790_000_000_000, reason: 'before-import', noteCount: 2, cardCount: 4, reviewCount: 8, bytes: 3000 });
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const db = {};
beforeEach(() => listRecoveryPoints.mockReset());

test('reads on mount, starts collapsed and explains that recovery excludes media', async () => {
  listRecoveryPoints.mockResolvedValue([point()]);
  const onRestore = jest.fn();
  await render(<RecoveryPointsPanel db={db} p={light} onRestore={onRestore} />);
  await waitFor(() => expect(listRecoveryPoints).toHaveBeenCalledTimes(1));
  expect(screen.queryByRole('button', { name: 'استعادة النقطة 1' })).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'نقاط الاستعادة' }));
  await waitFor(() => expect(listRecoveryPoints).toHaveBeenCalledTimes(2));
  expect(screen.getByText(/لا تشمل الصور والصوت/)).toBeTruthy();
  expect(screen.getByText('2 ملاحظة · 4 بطاقة · 8 مراجعة')).toBeTruthy();
  expect(onRestore).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole('button', { name: 'نقاط الاستعادة' }));
  expect(screen.queryByRole('button', { name: 'استعادة النقطة 1' })).toBeNull();
});

test('empty recovery list explains when points are created', async () => {
  listRecoveryPoints.mockResolvedValue([]);
  await render(<RecoveryPointsPanel db={db} p={light} onRestore={jest.fn()} />);
  await fireEvent.press(screen.getByRole('button', { name: 'نقاط الاستعادة' }));
  await waitFor(() => expect(screen.getByText(/لا توجد نقاط استعادة بعد/)).toBeTruthy());
  expect(screen.queryByText('استعادة هذه النقطة')).toBeNull();
});

test('read failure hides stale restore actions and explicit retry reloads points', async () => {
  listRecoveryPoints.mockRejectedValue(new Error('disk read failure'));
  await render(<RecoveryPointsPanel db={db} p={light} onRestore={jest.fn()} />);
  await fireEvent.press(screen.getByRole('button', { name: 'نقاط الاستعادة' }));
  await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
  listRecoveryPoints.mockResolvedValue([point(2)]);
  await fireEvent.press(screen.getByRole('button', { name: 'تحديث نقاط الاستعادة' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'استعادة النقطة 2' })).toBeTruthy());
  expect(screen.queryByRole('alert')).toBeNull();
});

test('pending restore prevents duplicate submission and refreshes the rotated list after success', async () => {
  listRecoveryPoints.mockResolvedValue([point()]);
  const gate = deferred(); const onRestore = jest.fn(() => gate.promise);
  await render(<RecoveryPointsPanel db={db} p={light} onRestore={onRestore} />);
  await fireEvent.press(screen.getByRole('button', { name: 'نقاط الاستعادة' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'استعادة النقطة 1' })).toBeTruthy());
  const restore = screen.getByRole('button', { name: 'استعادة النقطة 1' });
  await fireEvent.press(restore); await fireEvent.press(restore);
  expect(onRestore).toHaveBeenCalledTimes(1);
  expect(onRestore).toHaveBeenCalledWith(point());
  expect(screen.getByRole('button', { name: 'تحديث نقاط الاستعادة' }).props.accessibilityState.disabled).toBe(true);
  listRecoveryPoints.mockResolvedValue([point(3), point()]);
  await act(async () => { gate.resolve(true); await gate.promise; });
  await waitFor(() => expect(screen.getByRole('button', { name: 'استعادة النقطة 3' })).toBeTruthy());
  expect(screen.getByText(/استُعيدت بيانات الدراسة/)).toBeTruthy();
});

test('cancelled confirmation makes no success claim and a thrown restore can be retried', async () => {
  listRecoveryPoints.mockResolvedValue([point()]);
  const onRestore = jest.fn().mockResolvedValueOnce(false).mockRejectedValueOnce(new Error('cannot restore')).mockResolvedValueOnce(true);
  await render(<RecoveryPointsPanel db={db} p={light} onRestore={onRestore} />);
  await fireEvent.press(screen.getByRole('button', { name: 'نقاط الاستعادة' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'استعادة النقطة 1' })).toBeTruthy());
  await fireEvent.press(screen.getByRole('button', { name: 'استعادة النقطة 1' }));
  await waitFor(() => expect(onRestore).toHaveBeenCalledTimes(1));
  expect(screen.queryByText(/استُعيدت بيانات الدراسة/)).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'استعادة النقطة 1' }));
  await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
  await fireEvent.press(screen.getByRole('button', { name: 'استعادة النقطة 1' }));
  await waitFor(() => expect(onRestore).toHaveBeenCalledTimes(3));
  expect(screen.queryByRole('alert')).toBeNull();
});

test('completed restore with failed refresh reports the actual completion and offers refresh', async () => {
  listRecoveryPoints.mockResolvedValue([point()]);
  const onRestore = jest.fn(async () => { listRecoveryPoints.mockRejectedValue(new Error('refresh failed')); return true; });
  await render(<RecoveryPointsPanel db={db} p={light} onRestore={onRestore} />);
  await fireEvent.press(screen.getByRole('button', { name: 'نقاط الاستعادة' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'استعادة النقطة 1' })).toBeTruthy());
  await fireEvent.press(screen.getByRole('button', { name: 'استعادة النقطة 1' }));
  await waitFor(() => expect(screen.getByText(/تمت الاستعادة، لكن تعذّر تحديث القائمة/)).toBeTruthy());
  expect(onRestore).toHaveBeenCalledTimes(1);
});

test('external disabled state prevents starting restore or refresh', async () => {
  listRecoveryPoints.mockResolvedValue([point()]); const onRestore = jest.fn();
  const view = await render(<RecoveryPointsPanel db={db} p={light} onRestore={onRestore} />);
  await fireEvent.press(screen.getByRole('button', { name: 'نقاط الاستعادة' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'استعادة النقطة 1' })).toBeTruthy());
  await view.rerender(<RecoveryPointsPanel db={db} p={light} onRestore={onRestore} disabled />);
  await fireEvent.press(screen.getByRole('button', { name: 'استعادة النقطة 1' }));
  expect(onRestore).not.toHaveBeenCalled();
});
