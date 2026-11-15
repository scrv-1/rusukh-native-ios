import React from 'react';
import { AppState } from 'react-native';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react-native';
import * as Notifications from 'expo-notifications';
import { createReminderService, parseReminderTime, REMINDER_ID, REMINDER_OWNER } from '../src/reminders/service';
import { normalizeReminderPermission, expoReminderGateway } from '../src/reminders/expoGateway';
import { RemindersPanel } from '../src/reminders/RemindersPanel';
import { light } from '../src/ui';

jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('../src/storage', () => ({ getSetting: jest.fn(), setSetting: jest.fn() }));
jest.mock('expo-notifications', () => ({
  IosAuthorizationStatus: { NOT_DETERMINED: 0, DENIED: 1, AUTHORIZED: 2, PROVISIONAL: 3, EPHEMERAL: 4 },
  SchedulableTriggerInputTypes: { DAILY: 'daily' }, AndroidImportance: { DEFAULT: 3 },
  scheduleNotificationAsync: jest.fn(async ({ identifier }) => identifier),
  getPermissionsAsync: jest.fn(), requestPermissionsAsync: jest.fn(),
  getAllScheduledNotificationsAsync: jest.fn(), cancelScheduledNotificationAsync: jest.fn(),
  setNotificationChannelAsync: jest.fn(),
}));

const owned = (identifier = REMINDER_ID, hour = 19, minute = 0) => ({ identifier, owner: REMINDER_OWNER, kind: 'daily-study', hour, minute });
const foreign = { identifier: 'other-project', owner: 'another-app', kind: 'daily-study', hour: 10, minute: 0 };
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
function setup({ scheduled = [], saved = null, status = 'granted', canAskAgain = true } = {}) {
  let pending = [...scheduled];
  let value = saved;
  const store = { read: jest.fn(async () => value), write: jest.fn(async next => { value = next; }) };
  const gateway = {
    prepare: jest.fn(async () => {}),
    permissions: jest.fn(async () => ({ status, canAskAgain })),
    requestPermissions: jest.fn(async () => ({ status, canAskAgain })),
    list: jest.fn(async () => [...pending]),
    schedule: jest.fn(async (time, identifier) => {
      pending = pending.filter(item => item.identifier !== identifier);
      pending.push(owned(identifier, time.hour, time.minute)); return identifier;
    }),
    cancel: jest.fn(async identifier => { pending = pending.filter(item => item.identifier !== identifier); }),
  };
  return { service: createReminderService(gateway, store), gateway, store, pending: () => pending, saved: () => value };
}

test('default is OFF and reading never prompts or schedules; Arabic times validate strictly', async () => {
  const { service, gateway, store } = setup();
  expect(await service.read()).toMatchObject({ enabled: false, scheduled: 0, hour: 19, minute: 0 });
  expect(gateway.requestPermissions).not.toHaveBeenCalled();
  expect(gateway.schedule).not.toHaveBeenCalled();
  expect(store.write).not.toHaveBeenCalled();
  expect(parseReminderTime(' ١٩:٣٠ ')).toEqual({ hour: 19, minute: 30 });
  expect(parseReminderTime('۰۷:۰۵')).toEqual({ hour: 7, minute: 5 });
  for (const time of ['24:00', '12:60', '12:3', '19:00 extra', '-1:30', '']) expect(parseReminderTime(time)).toBeNull();
});

test('denied permission never schedules or saves, and cannotAskAgain avoids another prompt', async () => {
  const { service, gateway, store } = setup({ status: 'denied', canAskAgain: false });
  await expect(service.enable({ hour: 9, minute: 0 })).rejects.toThrow('لم يُسمح');
  expect(gateway.requestPermissions).not.toHaveBeenCalled();
  expect(gateway.schedule).not.toHaveBeenCalled();
  expect(store.write).not.toHaveBeenCalled();
});

test('successful enable reconciles only owned schedules and repeated updates keep exactly one', async () => {
  const { service, gateway, store, pending } = setup({ scheduled: [foreign, owned('legacy-a'), owned('legacy-b')] });
  const result = await service.enable({ hour: 8, minute: 15 });
  expect(result).toMatchObject({ enabled: true, scheduled: 1, hour: 8, minute: 15 });
  await service.enable({ hour: 8, minute: 30 });
  expect(pending()).toEqual([foreign, owned(REMINDER_ID, 8, 30)]);
  expect(gateway.cancel).not.toHaveBeenCalledWith(foreign.identifier);
  expect(JSON.parse(store.write.mock.calls.at(-1)[0])).toEqual({ version: 1, enabled: true, hour: 8, minute: 30 });
});

test('failed OS schedule preserves existing schedules and preferences', async () => {
  const saved = JSON.stringify({ version: 1, enabled: true, hour: 19, minute: 0 });
  const { service, gateway, store, pending } = setup({ scheduled: [owned(), foreign], saved });
  gateway.schedule.mockRejectedValueOnce(new Error('OS rejected request'));
  await expect(service.enable({ hour: 9, minute: 0 })).rejects.toThrow('OS rejected request');
  expect(gateway.cancel).not.toHaveBeenCalled();
  expect(store.write).not.toHaveBeenCalled();
  expect(pending()).toEqual([owned(), foreign]);
});

test('preference is written only after OS completion, with no false enabled state while pending', async () => {
  const { service, gateway, store } = setup();
  const gate = deferred();
  const schedule = gateway.schedule.getMockImplementation();
  gateway.schedule.mockImplementation(async (...args) => { await gate.promise; return schedule(...args); });
  const enabling = service.enable({ hour: 9, minute: 0 });
  await waitFor(() => expect(gateway.schedule).toHaveBeenCalled());
  expect(store.write).not.toHaveBeenCalled();
  gate.resolve(); await enabling;
  expect(store.write).toHaveBeenCalledTimes(1);
});

test('saved ON without an OS request stays OFF; storage failure after scheduling reports actual pending state', async () => {
  const missing = setup({ saved: JSON.stringify({ version: 1, enabled: true, hour: 8, minute: 0 }) });
  expect(await missing.service.read()).toMatchObject({ enabled: false, scheduled: 0, warning: expect.stringContaining('غير موجود') });
  expect(missing.gateway.schedule).not.toHaveBeenCalled();
  const { service, store } = setup();
  store.write.mockRejectedValueOnce(new Error('disk full'));
  await expect(service.enable({ hour: 8, minute: 0 })).rejects.toThrow('حفظ النظام');
  expect(await service.read()).toMatchObject({ enabled: true, scheduled: 1, warning: expect.stringContaining('لا يطابق') });
});

test('cancellation failure never persists OFF and retry cancels only our requests', async () => {
  const saved = JSON.stringify({ version: 1, enabled: true, hour: 19, minute: 0 });
  const { service, gateway, store, pending } = setup({ scheduled: [owned(), foreign], saved });
  gateway.cancel.mockRejectedValueOnce(new Error('OS unavailable'));
  await expect(service.disable()).rejects.toThrow('OS unavailable');
  expect(store.write).not.toHaveBeenCalled();
  expect((await service.read()).scheduled).toBe(1);
  await service.disable();
  expect(pending()).toEqual([foreign]);
  expect(JSON.parse(store.write.mock.calls[0][0]).enabled).toBe(false);
  expect(gateway.requestPermissions).not.toHaveBeenCalled();
});

test('concurrent enable and disable are serialized with no surviving late reminder', async () => {
  const { service, pending, saved } = setup({ scheduled: [foreign] });
  await Promise.all([service.enable({ hour: 21, minute: 0 }), service.disable()]);
  expect(pending()).toEqual([foreign]);
  expect(JSON.parse(saved()).enabled).toBe(false);
});

test('foreign identifier collision is rejected without cancelling or overwriting it', async () => {
  const { service, gateway, store } = setup({ scheduled: [{ ...foreign, identifier: REMINDER_ID }] });
  await expect(service.enable({ hour: 21, minute: 0 })).rejects.toThrow('تعارض');
  expect(gateway.schedule).not.toHaveBeenCalled(); expect(gateway.cancel).not.toHaveBeenCalled();
  expect(store.write).not.toHaveBeenCalled();
});

test('iOS provisional and ephemeral are distinguished from full permission; adapter schedules a private daily local trigger', async () => {
  for (const status of [3, 4]) expect(normalizeReminderPermission({ ios: { status }, granted: false, canAskAgain: false }).status).toBe('quiet');
  expect(normalizeReminderPermission({ ios: { status: 1 }, granted: true, canAskAgain: false }).status).toBe('denied');
  await expoReminderGateway.schedule({ hour: 7, minute: 10 }, REMINDER_ID);
  expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledWith({
    identifier: REMINDER_ID,
    content: expect.objectContaining({ sound: false, data: { owner: REMINDER_OWNER, kind: 'daily-study', hour: 7, minute: 10 } }),
    trigger: { type: 'daily', hour: 7, minute: 10, channelId: 'rusukh-local-study', delivery: 'bestEffort' },
  });
});

test('panel requires explicit activation, reports permission denial, and accepts Arabic time', async () => {
  const { service, gateway } = setup({ status: 'denied', canAskAgain: false });
  await render(<RemindersPanel db={{}} p={light} service={service} />);
  await screen.findByText('التذكير اليومي متوقف');
  expect(gateway.schedule).not.toHaveBeenCalled();
  await fireEvent.changeText(screen.getByLabelText('وقت التذكير (ساعة:دقيقة)'), '١٩:٣٠');
  await fireEvent.press(screen.getByRole('button', { name: 'تفعيل التذكير اليومي' }));
  await screen.findByText(/لم يُسمح بالإشعارات/);
  expect(screen.queryByText(/موعد يومي محفوظ في النظام/)).toBeNull();
  expect(gateway.schedule).not.toHaveBeenCalled();
});

test('panel shows OS-confirmed schedule only after success and supports explicit cancellation', async () => {
  const { service, gateway } = setup();
  const gate = deferred();
  const schedule = gateway.schedule.getMockImplementation();
  gateway.schedule.mockImplementation(async (...args) => { await gate.promise; return schedule(...args); });
  await render(<RemindersPanel db={{}} p={light} service={service} />);
  await screen.findByText('التذكير اليومي متوقف');
  await fireEvent.press(screen.getByRole('button', { name: 'تفعيل التذكير اليومي' }));
  expect(screen.queryByText(/موعد يومي محفوظ في النظام/)).toBeNull();
  await act(async () => { gate.resolve(); });
  await screen.findByText('موعد يومي محفوظ في النظام: 19:00');
  await fireEvent.press(screen.getByRole('button', { name: 'إلغاء التذكير اليومي' }));
  await screen.findByText('التذكير اليومي متوقف');
});

test('D005 returning to the foreground refreshes status without overwriting an edited time', async () => {
  let foreground;
  const spy = jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener) => { foreground = listener; return { remove: jest.fn() }; });
  try {
    const { service, gateway } = setup();
    await render(<RemindersPanel db={{}} p={light} service={service} />);
    await screen.findByText('التذكير اليومي متوقف');
    await fireEvent.changeText(screen.getByLabelText('وقت التذكير (ساعة:دقيقة)'), '20:30');
    await act(async () => foreground('active'));
    expect(screen.getByLabelText('وقت التذكير (ساعة:دقيقة)').props.value).toBe('20:30');
    expect(gateway.schedule).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole('button', { name: 'فحص حالة التذكير' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'تفعيل التذكير اليومي' })).toBeTruthy());
    expect(screen.getByLabelText('وقت التذكير (ساعة:دقيقة)').props.value).toBe('20:30');
  } finally { await screen.unmount(); spy.mockRestore(); }
});

test('a late foreground read cannot overwrite a newer successful schedule', async () => {
  let foreground;
  const spy = jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener) => { foreground = listener; return { remove: jest.fn() }; });
  try {
    const initial = { enabled: false, scheduled: 0, permission: 'granted', hour: 19, minute: 0 };
    const oldRead = deferred();
    const service = { read: jest.fn().mockResolvedValueOnce(initial).mockReturnValueOnce(oldRead.promise),
      enable: jest.fn(async time => ({ ...initial, ...time, enabled: true, scheduled: 1 })), disable: jest.fn() };
    await render(<RemindersPanel db={{}} p={light} service={service} />);
    await screen.findByText('التذكير اليومي متوقف');
    await act(async () => foreground('active'));
    await fireEvent.changeText(screen.getByLabelText('وقت التذكير (ساعة:دقيقة)'), '20:30');
    await fireEvent.press(screen.getByRole('button', { name: 'تفعيل التذكير اليومي' }));
    await screen.findByText('موعد يومي محفوظ في النظام: 20:30');
    await act(async () => oldRead.resolve(initial));
    expect(screen.getByLabelText('وقت التذكير (ساعة:دقيقة)').props.value).toBe('20:30');
    expect(screen.getByText('موعد يومي محفوظ في النظام: 20:30')).toBeTruthy();
  } finally { await screen.unmount(); spy.mockRestore(); }
});

test('failed enable preserves the draft while a successful enable makes later system refresh authoritative', async () => {
  let foreground;
  const spy = jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener) => { foreground = listener; return { remove: jest.fn() }; });
  try {
    const { service, gateway } = setup();
    await render(<RemindersPanel db={{}} p={light} service={service} />);
    await screen.findByText('التذكير اليومي متوقف');
    await fireEvent.changeText(screen.getByLabelText('وقت التذكير (ساعة:دقيقة)'), '20:30');
    gateway.schedule.mockRejectedValueOnce(new Error('schedule failed'));
    await fireEvent.press(screen.getByRole('button', { name: 'تفعيل التذكير اليومي' }));
    await screen.findByText('schedule failed');
    await act(async () => foreground('active'));
    expect(screen.getByLabelText('وقت التذكير (ساعة:دقيقة)').props.value).toBe('20:30');
    await fireEvent.press(screen.getByRole('button', { name: 'تفعيل التذكير اليومي' }));
    await screen.findByText('موعد يومي محفوظ في النظام: 20:30');
    gateway.list.mockResolvedValue([owned(REMINDER_ID, 21, 15)]);
    await act(async () => foreground('active'));
    expect(screen.getByLabelText('وقت التذكير (ساعة:دقيقة)').props.value).toBe('21:15');
  } finally { await screen.unmount(); spy.mockRestore(); }
});
