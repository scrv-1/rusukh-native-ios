import React from 'react';
import { Alert } from 'react-native';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import { MediaCapturePanel } from '../src/media/MediaCapturePanel';
import { dark } from '../src/ui';
import * as ImagePicker from 'expo-image-picker';
import * as Sharing from 'expo-sharing';
import * as library from '../src/media/library';
const mockPlayer = { pause: jest.fn(), play: jest.fn(), seekTo: jest.fn(async () => {}) };
let mockPlayerStatus;
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('expo-audio', () => ({
  useAudioPlayer: () => mockPlayer,
  useAudioPlayerStatus: () => mockPlayerStatus,
}));
jest.mock('expo-image-picker', () => ({ requestCameraPermissionsAsync: jest.fn(), launchCameraAsync: jest.fn(), launchImageLibraryAsync: jest.fn() }));
jest.mock('expo-sharing', () => ({ isAvailableAsync: jest.fn(), shareAsync: jest.fn() }));
jest.mock('../src/media/library', () => ({ loadMediaLibrary: jest.fn(), loadMediaTrash: jest.fn(), trashMediaItem: jest.fn(), restoreMediaItem: jest.fn(), permanentlyDeleteMediaItem: jest.fn(), mediaUri: jest.fn(), saveCapturedMedia: jest.fn() }));
jest.mock('../src/media/nativeRecorder', () => ({ nativeCaptureDependencies: {
  requestPermission: jest.fn(async () => ({ granted: true })),
  setRecordingMode: jest.fn(async () => {}),
  createRecorder: () => ({ prepare: async () => {}, record: () => {}, stop: async () => {}, release: () => {}, status: () => ({ recording: true, durationMs: 2000, uri: 'file:///test.m4a' }) }),
} }));
const image = { version: 1, id: 'photo-1', kind: 'image', fileName: 'photo-1.jpg', mimeType: 'image/jpeg', createdAt: 10000, sizeBytes: 1024, title: 'محاضرة عربية' };
beforeEach(() => {
  mockPlayerStatus = { isLoaded: true, playing: false, currentTime: 0, duration: 3, didJustFinish: false };
  mockPlayer.seekTo.mockResolvedValue(undefined);
  library.loadMediaLibrary.mockResolvedValue({ items: [], warnings: [] });
  library.loadMediaTrash.mockResolvedValue({ items: [], warnings: [] });
  library.trashMediaItem.mockResolvedValue(undefined);
  library.restoreMediaItem.mockResolvedValue({});
  library.permanentlyDeleteMediaItem.mockResolvedValue({});
  library.saveCapturedMedia.mockResolvedValue(image);
  library.mediaUri.mockImplementation(item => `file:///documents/${item.fileName}`);
  ImagePicker.requestCameraPermissionsAsync.mockResolvedValue({ granted: true });
  ImagePicker.launchCameraAsync.mockResolvedValue({ canceled: false, assets: [{ uri: 'file:///camera.jpg', mimeType: 'image/jpeg' }] });
  ImagePicker.launchImageLibraryAsync.mockResolvedValue({ canceled: false, assets: [{ uri: 'file:///picked.jpg', mimeType: 'image/jpeg' }] });
  Sharing.isAvailableAsync.mockResolvedValue(true);
  Sharing.shareAsync.mockResolvedValue(undefined);
});
async function ready(props = {}) {
  const ui = await render(<MediaCapturePanel p={dark} {...props} />);
  await waitFor(() => expect(ui.queryByText('جارٍ فتح الملفات المحفوظة…')).toBeNull());
  return ui;
}

test('camera denied exposes settings and never launches or saves', async () => {
  ImagePicker.requestCameraPermissionsAsync.mockResolvedValue({ granted: false });
  const ui = await ready();
  await fireEvent.press(ui.getByRole('button', { name: 'التقاط صورة' }));
  await waitFor(() => expect(ui.getByRole('button', { name: 'فتح إعدادات الجهاز' })).toBeTruthy());
  expect(ImagePicker.launchCameraAsync).not.toHaveBeenCalled();
  expect(library.saveCapturedMedia).not.toHaveBeenCalled();
});

test('canceling native photo picker never creates an attachment', async () => {
  ImagePicker.launchImageLibraryAsync.mockResolvedValue({ canceled: true, assets: null });
  const onCreated = jest.fn(); const ui = await ready({ onCreated });
  await fireEvent.press(ui.getByRole('button', { name: 'اختيار صورة' }));
  await waitFor(() => expect(ui.getByText('أُلغي اختيار الصورة.')).toBeTruthy());
  expect(library.saveCapturedMedia).not.toHaveBeenCalled();
  expect(onCreated).not.toHaveBeenCalled();
});

test('photo gets durable save with supplied title before creation callback, using image-only picker', async () => {
  const onCreated = jest.fn(); const ui = await ready({ onCreated });
  await fireEvent.changeText(ui.getByLabelText('عنوان الوسيط — اختياري'), 'محاضرة عربية');
  await fireEvent.press(ui.getByRole('button', { name: 'التقاط صورة' }));
  await waitFor(() => expect(onCreated).toHaveBeenCalledWith(image));
  expect(ImagePicker.launchCameraAsync).toHaveBeenCalledWith(expect.objectContaining({ mediaTypes: ['images'], exif: false }));
  expect(library.saveCapturedMedia).toHaveBeenCalledWith(expect.objectContaining({ uri: 'file:///camera.jpg', title: 'محاضرة عربية' }));
  expect(ui.getByText('حُفظت الصورة على جهازك.')).toBeTruthy();
});

test('failed photo save can retry without launching camera again or claiming earlier success', async () => {
  library.saveCapturedMedia.mockRejectedValueOnce(new Error('مساحة الجهاز غير كافية'));
  const onCreated = jest.fn(); const ui = await ready({ onCreated });
  await fireEvent.press(ui.getByRole('button', { name: 'التقاط صورة' }));
  await waitFor(() => expect(ui.getByText('مساحة الجهاز غير كافية')).toBeTruthy());
  expect(onCreated).not.toHaveBeenCalled();
  expect(ui.queryByText('حُفظت الصورة على جهازك.')).toBeNull();
  await fireEvent.press(ui.getByRole('button', { name: 'إعادة محاولة حفظ الصورة' }));
  await waitFor(() => expect(onCreated).toHaveBeenCalledWith(image));
  expect(ImagePicker.launchCameraAsync).toHaveBeenCalledTimes(1);
});

test('record button stops and saves an audio clip through real lifecycle controller', async () => {
  const audio = { ...image, kind: 'audio', fileName: 'audio-1.m4a', mimeType: 'audio/mp4', title: 'تسجيل صوتي' };
  library.saveCapturedMedia.mockResolvedValue(audio);
  const onCreated = jest.fn(); const ui = await ready({ onCreated });
  await fireEvent.press(ui.getByRole('button', { name: 'بدء التسجيل' }));
  await waitFor(() => expect(ui.getByRole('button', { name: 'إيقاف وحفظ التسجيل' })).toBeTruthy());
  await fireEvent.press(ui.getByRole('button', { name: 'إيقاف وحفظ التسجيل' }));
  await waitFor(() => expect(onCreated).toHaveBeenCalledWith(audio));
  expect(library.saveCapturedMedia).toHaveBeenCalledWith(expect.objectContaining({ kind: 'audio', uri: 'file:///test.m4a', durationMs: 2000 }));
});

test('share exports the actual retained local file and does not claim user saved it', async () => {
  library.loadMediaLibrary.mockResolvedValue({ items: [image], warnings: [] });
  const ui = await ready();
  await fireEvent.press(ui.getByRole('button', { name: 'مشاركة محاضرة عربية أو حفظه في الملفات' }));
  await waitFor(() => expect(Sharing.shareAsync).toHaveBeenCalledWith('file:///documents/photo-1.jpg', expect.objectContaining({ mimeType: 'image/jpeg' })));
  expect(ui.getByText('أُغلقت نافذة المشاركة. اختر «حفظ في الملفات» داخلها لتصدير نسخة.')).toBeTruthy();
});

test('replaying a finished clip waits for rewind after the transient end flag clears', async () => {
  mockPlayerStatus = { ...mockPlayerStatus, currentTime: 3, duration: 3, didJustFinish: false };
  const audio = { ...image, kind: 'audio', fileName: 'audio-1.m4a', mimeType: 'audio/mp4', title: 'تسجيل مكتمل' };
  library.loadMediaLibrary.mockResolvedValue({ items: [audio], warnings: [] });
  let finishSeek;
  mockPlayer.seekTo.mockImplementationOnce(() => new Promise(resolve => { finishSeek = resolve; }));
  const ui = await ready();
  await fireEvent.press(ui.getByRole('button', { name: /^استماع إلى / }));
  await fireEvent.press(ui.getByRole('button', { name: /^تشغيل التسجيل / }));
  expect(mockPlayer.seekTo).toHaveBeenCalledWith(0);
  expect(mockPlayer.play).not.toHaveBeenCalled();
  await act(async () => finishSeek());
  expect(mockPlayer.play).toHaveBeenCalledTimes(1);
});

async function openAudio(status) {
  mockPlayerStatus = { ...mockPlayerStatus, ...status };
  library.loadMediaLibrary.mockResolvedValue({ items: [{ ...image, kind: 'audio', fileName: 'audio-1.m4a', mimeType: 'audio/mp4' }], warnings: [] });
  const ui = await ready();
  await fireEvent.press(ui.getByRole('button', { name: /^استماع إلى / }));
  return ui;
}

test('pausing and resuming near the end preserves the current position', async () => {
  const ui = await openAudio({ playing: true, currentTime: 2.99, duration: 3 });
  await fireEvent.press(ui.getByRole('button', { name: /^إيقاف التشغيل مؤقتًا / }));
  expect(mockPlayer.pause).toHaveBeenCalledTimes(1);
  expect(mockPlayer.seekTo).not.toHaveBeenCalled();
  expect(mockPlayer.play).not.toHaveBeenCalled();
  mockPlayerStatus = { ...mockPlayerStatus, playing: false };
  await ui.rerender(<MediaCapturePanel p={dark} />);
  await fireEvent.press(ui.getByRole('button', { name: /^تشغيل التسجيل / }));
  expect(mockPlayer.seekTo).not.toHaveBeenCalled();
  expect(mockPlayer.play).toHaveBeenCalledTimes(1);
});

test.each([0, undefined, NaN, Infinity])('unknown duration %s does not rewind an uncompleted clip', async unknownDuration => {
  const ui = await openAudio({ currentTime: 0, duration: unknownDuration, didJustFinish: false });
  await fireEvent.press(ui.getByRole('button', { name: /^تشغيل التسجيل / }));
  expect(mockPlayer.seekTo).not.toHaveBeenCalled();
  expect(mockPlayer.play).toHaveBeenCalledTimes(1);
});

test('a native completion event can rewind even when duration is unknown', async () => {
  const ui = await openAudio({ currentTime: 3, duration: 0, didJustFinish: true });
  await fireEvent.press(ui.getByRole('button', { name: /^تشغيل التسجيل / }));
  await waitFor(() => expect(mockPlayer.play).toHaveBeenCalledTimes(1));
  expect(mockPlayer.seekTo).toHaveBeenCalledWith(0);
});

test('failed rewind shows the panel error without playing and can be retried', async () => {
  const ui = await openAudio({ currentTime: 3, duration: 3 });
  mockPlayer.seekTo.mockRejectedValueOnce(new Error('seek failed'));
  await fireEvent.press(ui.getByRole('button', { name: /^تشغيل التسجيل / }));
  await waitFor(() => expect(ui.getByRole('alert')).toHaveTextContent('تعذّر تشغيل الملف الصوتي.'));
  expect(mockPlayer.play).not.toHaveBeenCalled();
  await fireEvent.press(ui.getByRole('button', { name: /^تشغيل التسجيل / }));
  await waitFor(() => expect(mockPlayer.play).toHaveBeenCalledTimes(1));
  expect(ui.queryByText('تعذّر تشغيل الملف الصوتي.')).toBeNull();
});

test('X205 audio actions distinguish identical titles by their filenames', async () => {
  library.loadMediaLibrary.mockResolvedValue({ items: [
    { ...image, id: 'audio-1', kind: 'audio', fileName: 'audio-1.m4a', mimeType: 'audio/mp4' },
    { ...image, id: 'audio-2', kind: 'audio', fileName: 'audio-2.m4a', mimeType: 'audio/mp4' },
  ], warnings: [] });
  const ui = await ready();
  expect(ui.getByRole('button', { name: 'استماع إلى محاضرة عربية، audio-1.m4a' })).toBeTruthy();
  await fireEvent.press(ui.getByRole('button', { name: 'استماع إلى محاضرة عربية، audio-2.m4a' }));
  expect(ui.getByRole('button', { name: 'تشغيل التسجيل محاضرة عربية، audio-2.m4a' })).toBeTruthy();
  expect(ui.getByRole('button', { name: 'إغلاق مشغّل محاضرة عربية، audio-2.m4a' })).toBeTruthy();
});

test('D007 removal asks confirmation and stops the player before moving its file', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  try {
    const ui = await openAudio({ playing: true });
    await fireEvent.press(ui.getByRole('button', { name: 'نقل محاضرة عربية، audio-1.m4a إلى المحذوفات' }));
    expect(library.trashMediaItem).not.toHaveBeenCalled();
    const actions = alert.mock.calls.at(-1)[2];
    expect(actions.find(action => action.style === 'cancel')).toBeTruthy();
    library.trashMediaItem.mockImplementation(async () => { expect(mockPlayer.pause).toHaveBeenCalled(); });
    await act(async () => actions.find(action => action.style === 'destructive').onPress());
    await waitFor(() => expect(library.trashMediaItem).toHaveBeenCalledTimes(1));
  } finally { alert.mockRestore(); }
});

test('canceling removal leaves the item untouched and a failed move does not claim success', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  try {
    library.loadMediaLibrary.mockResolvedValue({ items: [image], warnings: [] });
    const ui = await ready();
    await fireEvent.press(ui.getByRole('button', { name: /نقل محاضرة عربية، photo-1.jpg إلى المحذوفات/ }));
    const actions = alert.mock.calls.at(-1)[2];
    expect(actions.find(action => action.style === 'cancel').text).toBe('إلغاء');
    expect(library.trashMediaItem).not.toHaveBeenCalled();
    expect(ui.getByText('محاضرة عربية')).toBeTruthy();
    library.trashMediaItem.mockRejectedValueOnce(new Error('لم يكتمل النقل. احتُفظ بالملف.'));
    await act(async () => actions.find(action => action.style === 'destructive').onPress());
    await waitFor(() => expect(ui.getByText('لم يكتمل النقل. احتُفظ بالملف.')).toBeTruthy());
    expect(ui.queryByText('نُقل الوسيط إلى المحذوفات. يمكنك استعادته.')).toBeNull();
    expect(ui.getByText('محاضرة عربية')).toBeTruthy();
  } finally { alert.mockRestore(); }
});

test('permanent deletion requires a separate confirmation and exposes failure without hiding the trash item', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  try {
    library.loadMediaTrash.mockResolvedValue({ items: [image], warnings: [] });
    const ui = await ready();
    await fireEvent.press(ui.getByRole('button', { name: 'عرض المحذوفات (1)' }));
    await fireEvent.press(ui.getByRole('button', { name: 'حذف محاضرة عربية، photo-1.jpg نهائيًا' }));
    expect(alert.mock.calls.at(-1)[1]).toContain('لا يمكن التراجع');
    expect(library.permanentlyDeleteMediaItem).not.toHaveBeenCalled();
    library.permanentlyDeleteMediaItem.mockRejectedValueOnce(new Error('تعذّر حذف الملف'));
    await act(async () => alert.mock.calls.at(-1)[2].find(action => action.style === 'destructive').onPress());
    await waitFor(() => expect(ui.getByText('تعذّر حذف الملف')).toBeTruthy());
    expect(ui.getByRole('button', { name: 'استعادة محاضرة عربية، photo-1.jpg' })).toBeTruthy();
    expect(ui.queryByText('حُذف ملف الوسيط نهائيًا من التطبيق.')).toBeNull();
  } finally { alert.mockRestore(); }
});

test('a restore failure keeps the trash entry and a successful retry refreshes the library', async () => {
  library.loadMediaTrash.mockResolvedValue({ items: [image], warnings: [] });
  const ui = await ready();
  await fireEvent.press(ui.getByRole('button', { name: 'عرض المحذوفات (1)' }));
  library.restoreMediaItem.mockRejectedValueOnce(new Error('تعذّرت الاستعادة'));
  await fireEvent.press(ui.getByRole('button', { name: 'استعادة محاضرة عربية، photo-1.jpg' }));
  await waitFor(() => expect(ui.getByText('تعذّرت الاستعادة')).toBeTruthy());
  library.restoreMediaItem.mockImplementationOnce(async () => {
    library.loadMediaTrash.mockResolvedValue({ items: [], warnings: [] });
    library.loadMediaLibrary.mockResolvedValue({ items: [image], warnings: [] });
    return {};
  });
  await fireEvent.press(ui.getByRole('button', { name: 'استعادة محاضرة عربية، photo-1.jpg' }));
  await waitFor(() => expect(ui.getByText('استُعيد الوسيط إلى المكتبة.')).toBeTruthy());
  expect(ui.getByRole('button', { name: 'نقل محاضرة عربية، photo-1.jpg إلى المحذوفات' })).toBeTruthy();
});

test('removing a clip cancels playback queued behind a pending rewind', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  try {
    let finishSeek;
    mockPlayer.seekTo.mockImplementationOnce(() => new Promise(resolve => { finishSeek = resolve; }));
    const ui = await openAudio({ currentTime: 3, duration: 3, playing: false });
    await fireEvent.press(ui.getByRole('button', { name: /^تشغيل التسجيل / }));
    expect(mockPlayer.play).not.toHaveBeenCalled();
    await fireEvent.press(ui.getByRole('button', { name: 'نقل محاضرة عربية، audio-1.m4a إلى المحذوفات' }));
    await act(async () => alert.mock.calls.at(-1)[2].find(action => action.style === 'destructive').onPress());
    await waitFor(() => expect(library.trashMediaItem).toHaveBeenCalled());
    await act(async () => finishSeek());
    expect(mockPlayer.play).not.toHaveBeenCalled();
  } finally { alert.mockRestore(); }
});
