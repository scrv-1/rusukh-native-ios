import type { CapturedMedia, MediaItem } from './types';
import { newMediaId } from './types';

export type CaptureState = 'idle' | 'preparing' | 'recording' | 'saving' | 'saved' | 'denied' | 'error';
export type StopReason = 'manual' | 'background' | 'interrupted' | 'unmount' | 'limit';
export type CaptureSnapshot = { state: CaptureState; durationMs: number; canRetry: boolean; reason?: StopReason; item?: MediaItem; error?: string };
export type RecorderPort = {
  prepare(): Promise<void>;
  record(): void;
  stop(): Promise<void>;
  status(): { recording: boolean; durationMs: number; uri: string | null };
  release(): void;
};
export type CaptureDependencies = {
  requestPermission(): Promise<{ granted: boolean }>;
  createRecorder(id: string): RecorderPort;
  setRecordingMode(enabled: boolean): Promise<void>;
  save(input: CapturedMedia): Promise<MediaItem>;
};

// Expo's recording mode applies to every recorder in the process. Keep ownership
// until a departing screen finishes saving and native cleanup, so its finalizer
// cannot disable a recorder started by a freshly mounted screen.
let captureOwnership = Promise.resolve();
function acquireCaptureOwnership(): Promise<() => void> {
  const previous = captureOwnership;
  let release!: () => void;
  captureOwnership = new Promise<void>(resolve => { release = resolve; });
  return previous.then(() => release);
}

/** Explicit ownership keeps the native recorder alive until stop + durable save finish. */
export class AudioCaptureSession {
  snapshot: CaptureSnapshot = { state: 'idle', durationMs: 0, canRetry: false };
  private listeners = new Set<(snapshot: CaptureSnapshot) => void>();
  private recorder?: RecorderPort;
  private starting?: Promise<void>;
  private stopping?: Promise<void>;
  private pending?: CapturedMedia;
  private releaseOwnership?: () => void;
  private active = true;
  private closed = false;
  private generation = 0;
  private id = '';
  constructor(private deps: CaptureDependencies) {}

  subscribe(listener: (snapshot: CaptureSnapshot) => void) {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }
  private update(next: Partial<CaptureSnapshot>) {
    this.snapshot = { ...this.snapshot, ...next };
    if (!this.closed) this.listeners.forEach(listener => listener(this.snapshot));
  }
  private async releaseRecordingMode() {
    const release = this.releaseOwnership;
    if (!release) return;
    this.releaseOwnership = undefined;
    try { await this.deps.setRecordingMode(false); }
    finally { release(); }
  }
  private async cleanupRecorder() {
    const recorder = this.recorder;
    this.recorder = undefined;
    try { recorder?.release(); }
    finally { await this.releaseRecordingMode(); }
  }
  start(): Promise<void> {
    if (this.starting) return this.starting;
    if (this.closed || !this.active || this.recorder || this.stopping || this.pending) return Promise.resolve();
    const generation = ++this.generation;
    const cancelled = () => this.closed || !this.active || generation !== this.generation;
    this.update({ state: 'preparing', durationMs: 0, canRetry: false, error: undefined, item: undefined, reason: undefined });
    this.starting = (async () => {
      try {
        const permission = await this.deps.requestPermission();
        if (cancelled()) { this.update({ state: 'idle' }); return; }
        if (!permission.granted) { this.update({ state: 'denied' }); return; }
        this.releaseOwnership = await acquireCaptureOwnership();
        if (cancelled()) { await this.releaseRecordingMode(); this.update({ state: 'idle' }); return; }
        await this.deps.setRecordingMode(true);
        if (cancelled()) { await this.releaseRecordingMode(); this.update({ state: 'idle' }); return; }
        this.id = newMediaId();
        const recorder = this.deps.createRecorder(this.id);
        this.recorder = recorder;
        await recorder.prepare();
        if (cancelled()) {
          try { await recorder.stop(); } finally { await this.cleanupRecorder(); }
          this.update({ state: 'idle' });
          return;
        }
        recorder.record();
        this.update({ state: 'recording' });
      } catch {
        if (this.recorder) {
          try { await this.recorder.stop(); } catch { /* Native preparation may have failed before a recording existed. */ }
        }
        try { await this.cleanupRecorder(); } catch { /* Original failure is shown below. */ }
        this.update({ state: 'error', error: 'تعذّر بدء التسجيل. تحقق من إذن الميكروفون ومساحة الجهاز.', canRetry: false });
      }
    })().finally(() => { this.starting = undefined; });
    return this.starting;
  }
  stop(reason: StopReason = 'manual'): Promise<void> {
    if (this.stopping) return this.stopping;
    this.stopping = (async () => {
      if (this.starting) await this.starting;
      const recorder = this.recorder;
      if (!recorder) return;
      this.update({ state: 'saving', reason });
      try {
        const before = recorder.status();
        await recorder.stop();
        const after = recorder.status();
        const uri = after.uri ?? before.uri;
        if (!uri) throw new Error('Recording file unavailable');
        this.pending = { id: this.id, kind: 'audio', uri, mimeType: 'audio/mp4', durationMs: Math.max(before.durationMs, after.durationMs, this.snapshot.durationMs) };
        await this.persist();
      } catch {
        this.update({ state: 'error', canRetry: !!this.pending, error: 'تعذّر حفظ التسجيل. إن وُجد ملف صوتي محفوظ فسيُستعاد عند فتح المكتبة مجددًا.' });
      } finally {
        try { await this.cleanupRecorder(); } catch { /* Stop/save outcome is known; ownership is released even if native cleanup fails. */ }
      }
    })().finally(() => { this.stopping = undefined; });
    return this.stopping;
  }
  private async persist() {
    if (!this.pending) return;
    const item = await this.deps.save(this.pending);
    this.pending = undefined;
    this.update({ state: 'saved', canRetry: false, item, error: undefined });
  }
  retrySave(): Promise<void> {
    if (this.stopping) return this.stopping;
    if (!this.pending) return Promise.resolve();
    this.update({ state: 'saving' });
    this.stopping = this.persist().catch(() => {
      this.update({ state: 'error', canRetry: true, error: 'لم يكتمل الحفظ. حرّر مساحة ثم أعد المحاولة.' });
    }).finally(() => { this.stopping = undefined; });
    return this.stopping;
  }
  async poll() {
    if (this.snapshot.state !== 'recording' || !this.recorder) return;
    try {
      const status = this.recorder.status();
      this.update({ durationMs: status.durationMs });
      if (!status.recording) await this.stop('interrupted');
      else if (status.durationMs >= 30 * 60 * 1000) await this.stop('limit');
    } catch { await this.stop('interrupted'); }
  }
  async setActive(active: boolean) {
    this.active = active;
    if (!active) { this.generation++; await this.stop('background'); }
  }
  async dispose() {
    this.closed = true;
    this.listeners.clear();
    this.active = false;
    this.generation++;
    await this.stop('unmount');
  }
}
