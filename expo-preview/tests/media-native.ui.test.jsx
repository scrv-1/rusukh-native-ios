const mockRecorder = {
  prepareToRecordAsync: jest.fn(async () => {}), record: jest.fn(), stop: jest.fn(async () => {}),
  getStatus: jest.fn(() => ({ isRecording: true, durationMillis: 1234, url: 'file:///fallback.m4a' })),
  uri: 'file:///recording.m4a', release: jest.fn(),
};
const mockUntrack = jest.fn();
jest.mock('expo-audio', () => ({
  AudioModule: { requestRecordingPermissionsAsync: jest.fn(async () => ({ granted: true })), AudioRecorder: jest.fn(() => mockRecorder) },
  RecordingPresets: { HIGH_QUALITY: { extension: '.m4a', sampleRate: 44100, numberOfChannels: 2, bitRate: 128000, ios: { outputFormat: 'aac ', audioQuality: 127 }, android: { outputFormat: 'mpeg4', audioEncoder: 'aac' }, web: { mimeType: 'audio/webm' } } },
  setAudioModeAsync: jest.fn(async () => {}),
}));
jest.mock('../src/media/library', () => ({ saveCapturedMedia: jest.fn(), trackActiveRecording: jest.fn(() => mockUntrack) }));
import { AudioModule, setAudioModeAsync } from 'expo-audio';
import { nativeCaptureDependencies } from '../src/media/nativeRecorder';
import { trackActiveRecording } from '../src/media/library';

test('SDK adapter requests microphone and never enables background capture/playback', async () => {
  expect(await nativeCaptureDependencies.requestPermission()).toEqual({ granted: true });
  expect(AudioModule.requestRecordingPermissionsAsync).toHaveBeenCalledTimes(1);
  await nativeCaptureDependencies.setRecordingMode(true);
  expect(setAudioModeAsync).toHaveBeenCalledWith(expect.objectContaining({ allowsRecording: true, allowsBackgroundRecording: false, shouldPlayInBackground: false }));
  await nativeCaptureDependencies.setRecordingMode(false);
  expect(setAudioModeAsync).toHaveBeenLastCalledWith(expect.objectContaining({ allowsRecording: false, allowsBackgroundRecording: false }));
});

test('SDK recorder uses retained document file, mono AAC, real stop/status/release and guards recovery', async () => {
  const recorder = nativeCaptureDependencies.createRecorder('test-123');
  expect(AudioModule.AudioRecorder).toHaveBeenCalledWith(expect.objectContaining({ directory: 'document', fileName: 'rusukh-recording-test-123', extension: '.m4a', numberOfChannels: 1, bitRate: 64000, outputFormat: 'aac ' }));
  expect(trackActiveRecording).toHaveBeenCalledWith('test-123');
  await recorder.prepare(); recorder.record();
  expect(mockRecorder.prepareToRecordAsync).toHaveBeenCalledWith(expect.objectContaining({ directory: 'document', fileName: 'rusukh-recording-test-123' }));
  expect(recorder.status()).toEqual({ recording: true, durationMs: 1234, uri: 'file:///recording.m4a' });
  await recorder.stop();
  expect(mockRecorder.stop).toHaveBeenCalledTimes(1);
  recorder.release();
  expect(mockRecorder.release).toHaveBeenCalledTimes(1);
  expect(mockUntrack).toHaveBeenCalledTimes(1);
});
