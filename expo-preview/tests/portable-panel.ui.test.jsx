import React from 'react';
import { Alert, AppState } from 'react-native';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react-native';
import { Directory } from 'expo-file-system';
import { PortableBackupPanel } from '../src/backup/PortableBackupPanel';
import { exportPortableFolder, inspectPortableFolder, mergePortableMedia } from '../src/backup/portable';
import { light } from '../src/ui';

jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('expo-file-system', () => ({ Directory: { pickDirectoryAsync: jest.fn() } }));
jest.mock('../src/backup/portable', () => ({ exportPortableFolder: jest.fn(), inspectPortableFolder: jest.fn(), mergePortableMedia: jest.fn() }));
const preview = { directory: { uri: 'file:///selected' }, manifestSHA256: 'abc',
  manifest: { media: [{}] }, study: { notes: [{}], cards: [], reviews: [] }, preferences: { isDark: true } };
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { resolve, promise }; };
let mockBackground;
beforeEach(() => {
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  jest.spyOn(AppState, 'addEventListener').mockImplementation((event, fn) => { mockBackground = fn; return { remove: jest.fn() }; });
  Directory.pickDirectoryAsync.mockReset().mockResolvedValue(preview.directory);
  inspectPortableFolder.mockReset().mockResolvedValue(preview);
  mergePortableMedia.mockReset().mockResolvedValue({ added: 1, reused: 0, study: preview.study, preferences: preview.preferences });
  exportPortableFolder.mockReset().mockResolvedValue({ directory: { name: 'rusukh-backup-test' }, mediaCount: 1 });
});
afterEach(() => jest.restoreAllMocks());
async function setup(extra = {}) {
  const props = { p: light, getSnapshot: jest.fn().mockResolvedValue({ study: preview.study, preferences: preview.preferences }),
    restoreStudy: jest.fn().mockResolvedValue(true), applyPreferences: jest.fn().mockResolvedValue(undefined), ...extra };
  const view = await render(<PortableBackupPanel {...props} />); return { props, view };
}
async function select() {
  await fireEvent.press(screen.getByRole('button', { name: 'اختيار مجلد نسخة للمعاينة' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'استعادة النص وإضافة الوسائط' })).toBeTruthy());
}
async function confirm() {
  await fireEvent.press(screen.getByRole('button', { name: 'استعادة النص وإضافة الوسائط' }));
  const buttons = Alert.alert.mock.calls.at(-1)[2];
  await act(async () => { buttons.find(b => b.style === 'destructive').onPress(); });
}

test('selection only previews, and cancelling confirmation never restores study or media', async () => {
  const { props } = await setup(); await select();
  expect(props.restoreStudy).not.toHaveBeenCalled(); expect(mergePortableMedia).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole('button', { name: 'استعادة النص وإضافة الوسائط' }));
  expect(Alert.alert.mock.calls[0][2].find(b => b.style === 'cancel').text).toBe('إلغاء');
  expect(props.restoreStudy).not.toHaveBeenCalled();
});

test('restore waits for media, prevents duplicate submissions, and success waits for the SQL callback', async () => {
  const media = deferred(), sql = deferred();
  mergePortableMedia.mockImplementation(() => media.promise);
  const { props } = await setup({ restoreStudy: jest.fn(() => sql.promise) });
  await select(); await confirm();
  expect(props.restoreStudy).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole('button', { name: 'استعادة النص وإضافة الوسائط' }));
  expect(mergePortableMedia).toHaveBeenCalledTimes(1);
  await act(async () => { media.resolve({ added: 1, reused: 0, study: preview.study }); await media.promise; });
  expect(props.restoreStudy).toHaveBeenCalledWith(preview.study);
  expect(screen.queryByText(/اكتملت الاستعادة:/)).toBeNull();
  expect(screen.queryByRole('button', { name: 'إيقاف النسخ أو الفحص' })).toBeNull();
  await act(async () => { sql.resolve(true); await sql.promise; });
  await waitFor(() => expect(screen.getByText(/اكتملت الاستعادة:/)).toBeTruthy());
  expect(props.applyPreferences).not.toHaveBeenCalled();
});

test('media failure is explicit about partial additions and never invokes text replacement', async () => {
  mergePortableMedia.mockRejectedValue(new Error('copy failed'));
  const { props } = await setup(); await select(); await confirm();
  await waitFor(() => expect(screen.getByText(/قد تكون أضيفت وسائط قبل التوقف؛ بيانات الدراسة لم تُستبدل/)).toBeTruthy());
  expect(props.restoreStudy).not.toHaveBeenCalled();
  expect(screen.queryByText(/اكتملت الاستعادة:/)).toBeNull();
});

test('failed text callback reports retained added media and makes no success claim', async () => {
  const { props } = await setup({ restoreStudy: jest.fn().mockResolvedValue(false) }); await select(); await confirm();
  await waitFor(() => expect(screen.getByText(/الوسائط المضافة محفوظة/)).toBeTruthy());
  expect(props.restoreStudy).toHaveBeenCalledTimes(1); expect(screen.queryByText(/اكتملت الاستعادة:/)).toBeNull();
});

test('explicit preference-only action revalidates and never restores study or media', async () => {
  const { props } = await setup(); await select();
  await fireEvent.press(screen.getByRole('button', { name: 'تطبيق المظهر وترتيب الأدوات فقط' }));
  await waitFor(() => expect(props.applyPreferences).toHaveBeenCalledWith(preview.preferences));
  expect(inspectPortableFolder).toHaveBeenCalledTimes(2); expect(mergePortableMedia).not.toHaveBeenCalled();
  expect(props.restoreStudy).not.toHaveBeenCalled();
});

test('export awaits verified completion and uses the supplied consistent snapshot', async () => {
  const gate = deferred(); exportPortableFolder.mockImplementation(() => gate.promise);
  const { props } = await setup(); await fireEvent.press(screen.getByRole('button', { name: 'حفظ نسخة مع الوسائط في الملفات' }));
  await waitFor(() => expect(exportPortableFolder).toHaveBeenCalledTimes(1));
  expect(props.getSnapshot).toHaveBeenCalledTimes(1); expect(screen.queryByText(/اكتملت النسخة في/)).toBeNull();
  await act(async () => { gate.resolve({ directory: { name: 'rusukh-backup-verified' }, mediaCount: 2 }); await gate.promise; });
  await waitFor(() => expect(screen.getByText(/اكتملت النسخة في rusukh-backup-verified/)).toBeTruthy());
});

test('background cancellation prevents study replacement after an in-flight copy', async () => {
  const gate = deferred(); mergePortableMedia.mockImplementation(() => gate.promise);
  const { props } = await setup(); await select(); await confirm();
  await act(async () => { mockBackground('background'); gate.resolve({ added: 1, reused: 0, study: preview.study }); await gate.promise; });
  await waitFor(() => expect(screen.getByText(/أوقفت العملية. قد تكون أضيفت وسائط/)).toBeTruthy());
  expect(props.restoreStudy).not.toHaveBeenCalled();
});

test('disabled panel cannot start file selection or export', async () => {
  await setup({ disabled: true });
  await fireEvent.press(screen.getByRole('button', { name: 'حفظ نسخة مع الوسائط في الملفات' }));
  await fireEvent.press(screen.getByRole('button', { name: 'اختيار مجلد نسخة للمعاينة' }));
  expect(Directory.pickDirectoryAsync).not.toHaveBeenCalled();
});

test('unmount during media import cancels before text replacement', async () => {
  const gate = deferred(); mergePortableMedia.mockImplementation(() => gate.promise);
  const { props, view } = await setup(); await select(); await confirm();
  await view.unmount();
  await act(async () => { gate.resolve({ added: 1, reused: 0, study: preview.study }); await gate.promise; });
  expect(props.restoreStudy).not.toHaveBeenCalled();
});
