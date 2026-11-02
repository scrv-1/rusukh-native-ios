import { Platform } from 'react-native';
import { AudioModule, RecordingPresets, setAudioModeAsync } from 'expo-audio';
import type { RecordingOptions } from 'expo-audio';
import type { CaptureDependencies } from './AudioCaptureSession';
import { saveCapturedMedia, trackActiveRecording } from './library';

export const nativeCaptureDependencies: CaptureDependencies = {
  requestPermission: () => AudioModule.requestRecordingPermissionsAsync(),
  setRecordingMode: enabled => setAudioModeAsync({
    allowsRecording: enabled, playsInSilentMode: true,
    allowsBackgroundRecording: false, shouldPlayInBackground: false,
    interruptionMode: 'doNotMix',
  }),
  createRecorder(id) {
    const options: RecordingOptions = {
      ...RecordingPresets.HIGH_QUALITY,
      numberOfChannels: 1, bitRate: 64_000,
      directory: 'document', fileName: `rusukh-recording-${id}`,
    };
    // Mirror SDK58's platform-option flattening; own this object until durable save completes.
    // useAudioRecorder auto-release on unmount would race an asynchronous stop/copy.
    const platformOptions = Platform.OS === 'ios' ? options.ios : options.android;
    const recorder = new AudioModule.AudioRecorder({ ...options, ...platformOptions });
    const untrack = trackActiveRecording(id);
    return {
      prepare: () => recorder.prepareToRecordAsync(options),
      record: () => recorder.record(),
      stop: () => recorder.stop(),
      status: () => {
        const status = recorder.getStatus();
        return { recording: status.isRecording, durationMs: status.durationMillis, uri: recorder.uri ?? status.url };
      },
      release: () => { try { recorder.release(); } finally { untrack(); } },
    };
  },
  save: saveCapturedMedia,
};
