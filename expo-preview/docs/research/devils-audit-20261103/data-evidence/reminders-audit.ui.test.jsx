import { AppState } from 'react-native';
import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react-native';
import * as Notifications from 'expo-notifications';
import { createReminderService, parseReminderTime, REMINDER_ID, REMINDER_OWNER } from '../../../../src/reminders/service';
import { normalizeReminderPermission, expoReminderGateway } from '../../../../src/reminders/expoGateway';
import { RemindersPanel } from '../../../../src/reminders/RemindersPanel';
import { light } from '../../../../src/ui';

jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('../../../../src/storage', () => ({ getSetting: jest.fn(), setSetting: jest.fn() }));
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


test('D005 observed: returning to active overwrites an unsubmitted reminder time', async()=>{
  const listeners=[];
  const spy=jest.spyOn(AppState,'addEventListener').mockImplementation((event,fn)=>{listeners.push(fn);return {remove(){}};});
  try{
    const {service,gateway}=setup();
    await render(<RemindersPanel db={{}} p={light} service={service}/>);
    await screen.findByText('التذكير اليومي متوقف');
    await fireEvent.changeText(screen.getByLabelText('وقت التذكير (ساعة:دقيقة)'),'20:30');
    expect(screen.getByLabelText('وقت التذكير (ساعة:دقيقة)').props.value).toBe('20:30');
    await act(async()=>{for(const listener of listeners)listener('active');});
    await waitFor(()=>expect(screen.getByLabelText('وقت التذكير (ساعة:دقيقة)').props.value).toBe('19:00'));
    expect(gateway.schedule).not.toHaveBeenCalled();
    console.log('D005 REPRODUCED',JSON.stringify({editedTime:'20:30',afterReturn:screen.getByLabelText('وقت التذكير (ساعة:دقيقة)').props.value,scheduled:false}));
  }finally{spy.mockRestore();}
});
