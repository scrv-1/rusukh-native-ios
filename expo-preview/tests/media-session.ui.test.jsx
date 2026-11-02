import { AudioCaptureSession } from '../src/media/AudioCaptureSession';

const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
function setup(overrides = {}) {
  const events = [];
  const recorder = {
    prepare: jest.fn(async () => { events.push('prepare'); }),
    record: jest.fn(() => { events.push('record'); }),
    stop: jest.fn(async () => { events.push('stop'); }),
    status: jest.fn(() => ({ recording: true, durationMs: 3200, uri: 'file:///recording.m4a' })),
    release: jest.fn(() => { events.push('release'); }),
  };
  const deps = {
    requestPermission: jest.fn(async () => ({ granted: true })),
    createRecorder: jest.fn(() => recorder),
    setRecordingMode: jest.fn(async () => {}),
    save: jest.fn(async () => { events.push('save'); return { id: 'audio-1', kind: 'audio' }; }),
    ...overrides,
  };
  return { session: new AudioCaptureSession(deps), deps, recorder, events };
}

test('denied microphone permission never starts recording or claims a save', async () => {
  const { session, deps } = setup({ requestPermission: jest.fn(async () => ({ granted: false })) });
  await session.start();
  expect(session.snapshot.state).toBe('denied');
  expect(deps.createRecorder).not.toHaveBeenCalled();
  expect(deps.save).not.toHaveBeenCalled();
});

test('concurrent start/stop calls only create, stop and save one recorder', async () => {
  const { session, recorder, deps } = setup();
  await Promise.all([session.start(), session.start()]);
  await Promise.all([session.stop(), session.stop()]);
  expect(deps.createRecorder).toHaveBeenCalledTimes(1);
  expect(recorder.stop).toHaveBeenCalledTimes(1);
  expect(deps.save).toHaveBeenCalledTimes(1);
  expect(session.snapshot.state).toBe('saved');
});

test('background while permission prompt is open prevents late recording', async () => {
  const permission = deferred();
  const { session, deps } = setup({ requestPermission: () => permission.promise });
  const starting = session.start();
  const backgrounding = session.setActive(false);
  permission.resolve({ granted: true });
  await Promise.all([starting, backgrounding]);
  expect(deps.createRecorder).not.toHaveBeenCalled();
  expect(deps.save).not.toHaveBeenCalled();
});

test('unmount during preparation stops prepared recorder, releases after stopping and does not save an empty clip', async () => {
  const preparing = deferred();
  const { session, recorder, deps, events } = setup();
  recorder.prepare.mockImplementation(async () => { await preparing.promise; });
  const start = session.start();
  await Promise.resolve(); await Promise.resolve();
  const disposing = session.dispose();
  preparing.resolve();
  await Promise.all([start, disposing]);
  expect(recorder.record).not.toHaveBeenCalled();
  expect(deps.save).not.toHaveBeenCalled();
  expect(events.indexOf('release')).toBeGreaterThan(events.indexOf('stop'));
});

test('background stops and commits recording once, without background recording', async () => {
  const { session, deps, recorder } = setup();
  await session.start();
  await session.setActive(false);
  expect(recorder.stop).toHaveBeenCalledTimes(1);
  expect(deps.save).toHaveBeenCalledWith(expect.objectContaining({ uri: 'file:///recording.m4a', durationMs: 3200 }));
  expect(session.snapshot.reason).toBe('background');
  expect(deps.setRecordingMode).toHaveBeenLastCalledWith(false);
});

test('unmount waits for stop and persistence before releasing native object', async () => {
  const stopping = deferred();
  const { session, recorder, deps, events } = setup();
  recorder.stop.mockImplementation(async () => { events.push('stop'); await stopping.promise; });
  await session.start();
  const disposing = session.dispose();
  expect(recorder.release).not.toHaveBeenCalled();
  expect(deps.save).not.toHaveBeenCalled();
  stopping.resolve();
  await disposing;
  expect(events.indexOf('release')).toBeGreaterThan(events.indexOf('save'));
});

test('failed save is shown as retryable and retry uses original clip without recording again', async () => {
  const { session, deps } = setup();
  deps.save.mockRejectedValueOnce(new Error('disk full'));
  await session.start(); await session.stop();
  expect(session.snapshot.state).toBe('error');
  expect(session.snapshot.canRetry).toBe(true);
  await session.retrySave();
  expect(session.snapshot.state).toBe('saved');
  expect(deps.createRecorder).toHaveBeenCalledTimes(1);
  expect(deps.save).toHaveBeenCalledTimes(2);
});

test('an interrupted native recording is finalized once and reports interruption', async () => {
  const { session, recorder, deps } = setup();
  await session.start();
  recorder.status.mockReturnValue({ recording: false, durationMs: 3200, uri: 'file:///recording.m4a' });
  await session.poll(); await session.poll();
  expect(deps.save).toHaveBeenCalledTimes(1);
  expect(session.snapshot.reason).toBe('interrupted');
});

test('missing recording URI never produces success or a saved metadata item', async () => {
  const { session, recorder, deps } = setup();
  recorder.status.mockReturnValue({ recording: true, durationMs: 2000, uri: null });
  await session.start(); await session.stop();
  expect(session.snapshot.state).toBe('error');
  expect(deps.save).not.toHaveBeenCalled();
});
