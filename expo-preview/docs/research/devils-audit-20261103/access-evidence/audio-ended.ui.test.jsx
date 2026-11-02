import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { MediaCapturePanel } from '../../../../src/media/MediaCapturePanel';
import { dark } from '../../../../src/ui';
import * as ImagePicker from 'expo-image-picker';
import * as Sharing from 'expo-sharing';
import * as library from '../../../../src/media/library';
const mockPlayer = { pause: jest.fn(), play: jest.fn(), seekTo: jest.fn(async () => {}) };
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('expo-audio', () => ({
  useAudioPlayer: () => mockPlayer,
  useAudioPlayerStatus: () => ({ isLoaded: true, playing: false, currentTime: 3, duration: 3, didJustFinish: false }),
}));
jest.mock('expo-image-picker', () => ({ requestCameraPermissionsAsync: jest.fn(), launchCameraAsync: jest.fn(), launchImageLibraryAsync: jest.fn() }));
jest.mock('expo-sharing', () => ({ isAvailableAsync: jest.fn(), shareAsync: jest.fn() }));
jest.mock('../../../../src/media/library', () => ({ loadMediaLibrary: jest.fn(), mediaUri: jest.fn(), saveCapturedMedia: jest.fn() }));
jest.mock('../../../../src/media/nativeRecorder', () => ({ nativeCaptureDependencies: {
  requestPermission: jest.fn(async () => ({ granted: true })),
  setRecordingMode: jest.fn(async () => {}),
  createRecorder: () => ({ prepare: async () => {}, record: () => {}, stop: async () => {}, release: () => {}, status: () => ({ recording: true, durationMs: 2000, uri: 'file:///test.m4a' }) }),
} }));
const image = { version: 1, id: 'photo-1', kind: 'image', fileName: 'photo-1.jpg', mimeType: 'image/jpeg', createdAt: 10000, sizeBytes: 1024, title: 'محاضرة عربية' };
beforeEach(() => {
  library.loadMediaLibrary.mockResolvedValue({ items: [], warnings: [] });
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

test('audit: replay finished audio resets time even after transient end flag clears', async () => {
  const audio = { ...image, kind: 'audio', fileName: 'audio-1.m4a', mimeType: 'audio/mp4', title: 'تسجيل مكتمل' };
  library.loadMediaLibrary.mockResolvedValue({ items: [audio], warnings: [] });
  const ui = await ready();
  await fireEvent.press(ui.getByRole('button', { name: 'استماع' }));
  await fireEvent.press(ui.getByRole('button', { name: 'تشغيل التسجيل' }));
  expect(mockPlayer.play).toHaveBeenCalledTimes(1);
  expect(mockPlayer.seekTo).toHaveBeenCalledWith(0);
});
