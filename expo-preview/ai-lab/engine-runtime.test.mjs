import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { test } from 'node:test';

// Exercise the shipped entry point's event/ownership logic with a stub runtime.
// These tests do not execute WASM, load a model, or claim inference/device coverage.
const entry = (await readFile(new URL('./engine-entry.mjs', import.meta.url), 'utf8'))
  .replace(/^import [^\n]+\n/gm, '');
const flush = () => new Promise(resolve => setImmediate(resolve));
function deferred() {
  let resolve, reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

function laboratory() {
  const elements = new Map(), instances = [], messages = [], revoked = [], timers = new Map();
  let nextURL = 0, nextTimer = 0, pendingLoad = null;
  const element = id => {
    if (!elements.has(id)) elements.set(id, { value: '', textContent: '', addEventListener() {} });
    return elements.get(id);
  };
  class StubWllama {
    constructor(paths, options) {
      this.wasm = paths.default;
      this.logger = options.logger;
      this.loaded = false;
      this.exitCalls = 0;
      this.completion = deferred();
      this.load = pendingLoad;
      pendingLoad = null;
      instances.push(this);
    }
    setCompat() {}
    async loadModel() { if (this.load) await this.load.promise; this.loaded = true; }
    isModelLoaded() { return this.loaded; }
    getNumThreads() { return 1; }
    isMultithread() { return false; }
    static getLibllamaVersion() { return 'stub-runtime-no-inference'; }
    createCompletion() { return this.completion.promise; }
    async exit() { this.exitCalls++; this.loaded = false; if (this.exitWait) await this.exitWait.promise; }
  }
  const context = vm.createContext({
    Wllama: StubWllama, CacheManager: class {}, wasmBase64: '', workerCode: '',
    AI_PROTOCOL: 'test-event-protocol', AI_ENGINE_VERSION: 'stub-runtime-no-inference',
    MAX_SOURCE_CHARACTERS: 1600, MAX_MODEL_BYTES: 1024,
    Blob, Uint8Array, AbortController, performance, atob,
    setTimeout: callback => { timers.set(++nextTimer, callback); return nextTimer; },
    clearTimeout: id => timers.delete(id),
    URL: { createObjectURL: () => `blob:stub-${++nextURL}`, revokeObjectURL: url => revoked.push(url) },
    document: { getElementById: element, addEventListener() {} },
    window: { ReactNativeWebView: { postMessage: value => messages.push(JSON.parse(value)) }, addEventListener() {} },
  });
  vm.runInContext(entry, context);
  const engine = vm.runInContext('({loadModel, generate, unload, phase: () => phase})', context);
  const load = (blob = new Blob(['GGUF____________'])) => engine.loadModel(blob, 'stub.gguf');
  return { engine, load, instances, messages, revoked, timers,
    holdNextLoad: () => { pendingLoad = deferred(); return pendingLoad; },
    fail: runtime => runtime.logger.error({ type: 'error', message: 'simulated worker termination' }),
  };
}

test('worker failure during generation unloads immediately and rejects a late completion', async () => {
  const lab = laboratory();
  await lab.load();
  const runtime = lab.instances[0];
  const generation = lab.engine.generate(true);
  assert.equal(lab.engine.phase(), 'generating');
  lab.fail(runtime);
  await flush();
  assert.equal(lab.engine.phase(), 'error');
  assert.equal(runtime.exitCalls, 1);
  assert.equal(runtime.loaded, false);
  assert.equal(lab.timers.size, 0);
  assert.match(lab.messages.at(-1).payload.message, /simulated worker termination/);
  runtime.completion.resolve({ choices: [{ text: 'late stub completion' }] });
  await generation;
  assert.equal(lab.engine.phase(), 'error');
  assert.equal(lab.messages.some(message => message.type === 'diagnostic'), false);
});

test('worker failure while loading reports an error without waiting for the watchdog', async () => {
  const lab = laboratory();
  const heldLoad = lab.holdNextLoad();
  const loading = lab.load();
  await flush();
  assert.equal(lab.engine.phase(), 'loading');
  lab.fail(lab.instances[0]);
  await flush();
  assert.equal(lab.engine.phase(), 'error');
  assert.equal(lab.timers.size, 0);
  heldLoad.resolve();
  await loading;
  assert.equal(lab.engine.phase(), 'error');
});

test('late worker events from a disposed runtime cannot stop a new generation', async () => {
  const lab = laboratory();
  await lab.load();
  const old = lab.instances[0];
  await lab.engine.unload();
  await lab.load();
  const current = lab.instances[1];
  void lab.engine.generate(true);
  lab.fail(old);
  await flush();
  assert.equal(lab.engine.phase(), 'generating');
  assert.equal(current.exitCalls, 0);
  assert.equal(current.loaded, true);
  assert.equal(lab.revoked.includes(current.wasm), false);
});

test('delayed failed-runtime cleanup preserves a new generation and its WASM URL', async () => {
  const lab = laboratory();
  await lab.load();
  const old = lab.instances[0];
  old.exitWait = deferred();
  lab.fail(old);
  await lab.load();
  const current = lab.instances[1];
  void lab.engine.generate(true);
  old.exitWait.resolve();
  await flush();
  assert.equal(lab.engine.phase(), 'generating');
  assert.equal(current.exitCalls, 0);
  assert.equal(current.loaded, true);
  assert.deepEqual(lab.revoked, [old.wasm]);
  assert.notEqual(current.wasm, old.wasm);
  assert.equal(lab.revoked.includes(current.wasm), false);
});

test('a newer model selection supersedes a selection waiting for old-runtime cleanup', async () => {
  const lab = laboratory();
  await lab.load();
  const old = lab.instances[0];
  old.exitWait = deferred();
  const olderSelection = lab.load();
  await lab.load();
  const current = lab.instances[1];
  void lab.engine.generate(true);
  old.exitWait.resolve();
  await olderSelection;
  assert.equal(lab.instances.length, 2);
  assert.equal(lab.engine.phase(), 'generating');
  assert.equal(current.exitCalls, 0);
  assert.equal(lab.revoked.includes(current.wasm), false);
});

test('a rejected load does not publish a stale error after newer-runtime startup', async () => {
  const lab = laboratory();
  const heldLoad = lab.holdNextLoad();
  let publishedError;
  const loading = lab.load().catch(error => { publishedError = error; });
  await flush();
  const old = lab.instances[0];
  old.exitWait = deferred();
  heldLoad.reject(new Error('stale load failure'));
  await flush();
  await lab.load();
  const current = lab.instances[1];
  void lab.engine.generate(true);
  old.exitWait.resolve();
  await loading;
  assert.equal(publishedError, undefined);
  assert.equal(lab.engine.phase(), 'generating');
  assert.equal(current.exitCalls, 0);
  assert.equal(lab.revoked.includes(current.wasm), false);
});

test('superseded header reads cannot publish invalid-header or read errors over a newer generation', async () => {
  for (const failsToRead of [false, true]) {
    const lab = laboratory();
    const header = deferred();
    const blob = new Blob(['GGUF____________']);
    blob.slice = () => ({ arrayBuffer: () => header.promise });
    let publishedError;
    const loading = lab.load(blob).catch(error => { publishedError = error; });
    await flush();
    await lab.load();
    const current = lab.instances[0];
    void lab.engine.generate(true);
    if (failsToRead) header.reject(new Error('stale file read failure'));
    else header.resolve(new Uint8Array([0, 0, 0, 0]).buffer);
    await loading;
    assert.equal(publishedError, undefined);
    assert.equal(lab.engine.phase(), 'generating');
    assert.equal(lab.instances.length, 1);
    assert.equal(current.exitCalls, 0);
  }
});
