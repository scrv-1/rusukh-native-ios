import { Wllama, CacheManager } from '@wllama/wllama';
import { wasmBase64, workerCode } from 'rusukh-embedded-assets';
import { AI_PROTOCOL, AI_ENGINE_VERSION, MAX_SOURCE_CHARACTERS, MAX_MODEL_BYTES, parseDraft, studyMessages, studyResponseFormat, boundSource } from '../src/ai/contracts.ts';

const $ = id => document.getElementById(id);
const diagnostic = window.__RUSUKH_AI_DIAGNOSTIC__ === true;
let engine = null;
let wasmURL = null;
let selectedModel = null;
let modelName = '';
let phase = 'idle';
let abort = null;
let operation = 0;
let selection = 0;
let requestId = '';
let draft = null;
let startedAt = 0;
let timeout = null;

function emit(type, payload = {}) {
  const message = { protocol: AI_PROTOCOL, type, requestId, payload };
  if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(message));
  if (diagnostic) {
    window.__RUSUKH_AI_LAST_EVENT__ = message;
    if (type === 'status' || type === 'capabilities') $('diagnostic-output').textContent = JSON.stringify(message, null, 2);
    if (type === 'diagnostic') $('diagnostic-inference').textContent = JSON.stringify(message, null, 2);
  }
}
function status(next, message) {
  phase = next;
  $('status').textContent = message;
  const busy = next === 'loading' || next === 'generating';
  $('model').disabled = busy;
  $('generate').disabled = busy || !engine?.isModelLoaded();
  $('smoke').disabled = busy || !engine?.isModelLoaded();
  $('cancel').disabled = !busy;
  $('unload').disabled = !engine && !selectedModel;
  $('use-draft').hidden = !draft || next !== 'draft';
  emit('status', { phase: next, message, modelName, engine: AI_ENGINE_VERSION, elapsedMs: startedAt ? Math.round(performance.now() - startedAt) : 0 });
}
function clearTimer() { if (timeout) clearTimeout(timeout); timeout = null; }
function fail(error) {
  const message = error instanceof Error ? error.message : String(error);
  // Logs and source text stay inside this local WebView. No telemetry or model endpoint.
  status('error', message.slice(0, 700));
}
function makeWasmURL() {
  if (wasmURL) return wasmURL;
  const chunks = [];
  // Decode in pieces rather than creating another 16 MB binary string at once.
  for (let offset = 0; offset < wasmBase64.length; offset += 65536) {
    const binary = atob(wasmBase64.slice(offset, offset + 65536));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    chunks.push(bytes);
  }
  wasmURL = URL.createObjectURL(new Blob(chunks, { type: 'application/wasm' }));
  return wasmURL;
}
// Public adapter pinned to wllama 3.8.1. Force the same Asyncify runtime in Chrome
// and WKWebView; do not let user-agent detection fetch a CDN or switch to JSPI.
class EmbeddedCompatWllama extends Wllama {
  getWorkerResources() { return { wasmPath: makeWasmURL(), jsPath: { code: workerCode }, compat: true, noWebGPU: true }; }
}

// This laboratory only loads user-selected File/Blob objects. Disable the
// optional download cache so opaque/file WebView origins do not require OPFS.
// This does not replace the inference engine or model; no cached model exists.
const selectedFilesOnlyCache = new CacheManager([{
  isSupported: () => true,
  read: async () => null,
  getSize: async () => -1,
  list: async () => [],
  delete: async () => {},
  write: async () => { throw new Error('Model caching is disabled; select a local GGUF file.'); },
}]);

async function unload(message = 'أُفرغ النموذج من الذاكرة. اختر ملف GGUF لبدء جلسة جديدة.', preserveSelection = false) {
  const token = ++operation;
  if (!preserveSelection) selection++;
  clearTimer();
  abort?.abort();
  abort = null;
  const old = engine;
  const oldWasmURL = wasmURL;
  engine = null;
  wasmURL = null;
  selectedModel = null;
  draft = null;
  $('model').value = '';
  $('result').textContent = '';
  status('cancelled', message);
  try { await old?.exit(); } catch { /* Terminated worker is already unavailable. */ }
  // A newer session may have started while the old worker was exiting.
  if (oldWasmURL) URL.revokeObjectURL(oldWasmURL);
  return token;
}

async function loadModel(blob, name) {
  // Reject an invalid size/header before disposing a usable model or draft.
  // Passing this preflight does not guarantee that the runtime can load the GGUF.
  const candidate = ++selection;
  if (!(blob instanceof Blob) || blob.size < 16 || blob.size > MAX_MODEL_BYTES) throw new Error('اختر نموذج GGUF لا يتجاوز 768 ميبيبايت.');
  let header;
  try { header = new Uint8Array(await blob.slice(0, 4).arrayBuffer()); }
  catch (error) { if (candidate === selection) throw error; return; }
  if (candidate !== selection) return;
  if (String.fromCharCode(...header) !== 'GGUF') throw new Error('هذا الملف ليس نموذج GGUF.');
  const cleanupToken = await unload('جارٍ تجهيز المحرك المحلي…', true);
  if (cleanupToken !== operation || candidate !== selection) return;
  const token = ++operation;
  selectedModel = blob;
  modelName = String(name).slice(0, 160);
  startedAt = performance.now();
  status('loading', 'جارٍ تحميل النموذج محليًا. قد يستغرق ذلك وقتًا ويستهلك الذاكرة.');
  const quiet = () => {};
  const workerError = error => {
    // Generation changes operation, but this worker still owns its runtime.
    if (engine !== runtime) return;
    if (error?.type === 'error' && typeof error.message === 'string') {
      // wllama's Worker.onerror otherwise only logs and leaves the request pending.
      // Fail promptly instead of making the user wait for the watchdog timeout.
      void unload().then(failedOperation => {
        if (failedOperation === operation) fail(`تعذّر تشغيل عامل WASM: ${error.message}`);
      });
    }
  };
  const runtime = new EmbeddedCompatWllama({ default: makeWasmURL() }, { cacheManager: selectedFilesOnlyCache, suppressNativeLog: true, logger: { debug: quiet, log: quiet, warn: quiet, error: workerError } });
  runtime.setCompat({ wasm: makeWasmURL(), worker: { code: workerCode } });
  engine = runtime;
  timeout = setTimeout(() => { if (token === operation) void unload('انتهت مهلة تحميل النموذج (3 دقائق). جرّب ملفًا أصغر.'); }, 180000);
  try {
    await runtime.loadModel([blob], { n_ctx: 2048, n_batch: 128, n_ubatch: 64, n_threads: 1, n_parallel: 1, n_gpu_layers: 0, offload_kqv: false, cache_type_k: 'f16', cache_type_v: 'f16', seed: 42, reasoning: false, default_template_kwargs: { enable_thinking: false } });
    if (token !== operation) return;
    clearTimer();
    status('ready', `النموذج محمّل: ${modelName}. CPU بخيط واحد. لم نتحقق من بصمة الملف المختار أو جودة العربية على جهازك.`);
    emit('capabilities', { engine: AI_ENGINE_VERSION, cpu: true, gpu: false, neuralEngine: false, threads: runtime.getNumThreads(), multithread: runtime.isMultithread(), modelBytes: blob.size, modelName, integrity: 'unverified-local-file', hardwareValidated: false, llamaVersion: Wllama.getLibllamaVersion() });
  } catch (error) {
    if (token !== operation) return;
    clearTimer();
    const failedOperation = await unload(undefined, true);
    if (failedOperation === operation && candidate === selection) throw error;
  }
}

async function generate(smoke = false) {
  if (!engine?.isModelLoaded() || phase === 'generating' || phase === 'loading') return;
  const source = smoke ? '' : boundSource($('source').value);
  const responseFormat = smoke ? null : studyResponseFormat(source);
  // A newer generation owns the active model; a slow previous file selection
  // may neither unload it nor report a selection error over its busy controls.
  selection++;
  const token = ++operation;
  const runtime = engine;
  const sourceRequest = requestId;
  const fileName = modelName;
  draft = null;
  $('result').textContent = '';
  startedAt = performance.now();
  abort = new AbortController();
  const signal = abort.signal;
  status('generating', smoke ? 'اختبار حساب فعلي قصير للمحرك؛ ليس اختبارًا لجودة العربية…' : 'جارٍ توليد مسودة محليًا من المصدر. راجع الإجابة والشاهد قبل الاعتماد.');
  timeout = setTimeout(() => { if (token === operation) void unload('توقف التوليد بعد 3 دقائق. جرّب مصدرًا أقصر أو النموذج الأصغر.'); }, 180000);
  try {
    if (smoke) {
      const response = await runtime.createCompletion({ prompt: 'Once upon a time', max_tokens: 12, seed: 42, temperature: 0.7, abortSignal: signal });
      if (token !== operation) return;
      const text = response.choices?.[0]?.text || '';
      $('result').textContent = text;
      status('ready', 'انتهى اختبار التوليد القصير. هذا لا يثبت جودة عربية أو أداء آيفون.');
      emit('diagnostic', { kind: 'actual-raw-inference', text, usage: response.usage, elapsedMs: Math.round(performance.now() - startedAt), modelName: fileName, engine: AI_ENGINE_VERSION });
    } else {
      const response = await runtime.createChatCompletion({ messages: studyMessages(source), response_format: responseFormat, max_tokens: 192, temperature: 0.2, top_p: 0.8, top_k: 20, min_p: 0, seed: 42, abortSignal: signal });
      if (token !== operation || sourceRequest !== requestId) return;
      const raw = response.choices?.[0]?.message?.content || '';
      if (diagnostic) emit('diagnostic', { kind: 'actual-chat-inference', raw, usage: response.usage, elapsedMs: Math.round(performance.now() - startedAt), modelName: fileName });
      if (response.choices?.[0]?.finish_reason === 'length') throw new Error('توقفت الإجابة عند حد الرموز. لم نحفظ نتيجة مبتورة. جرّب مقطعًا أقصر.');
      draft = parseDraft(raw, source, fileName);
      $('result').textContent = draft.questions.map(q => `${q.question}\n${q.answer}\nالشاهد: «${q.evidence}»`).join('\n\n');
      status('draft', 'مسودة مولّدة فعليًا. طابقنا نص الشاهد فقط؛ راجع صحة الاستنتاج بنفسك. لم تُحفظ بعد.');
    }
  } catch (error) { if (token === operation) fail(error); }
  finally { if (token === operation) { clearTimer(); abort = null; } }
}

window.RusukhAI = {
  receive(message) {
    if (!message || message.protocol !== AI_PROTOCOL) return;
    if (message.type === 'source' && typeof message.requestId === 'string' && typeof message.sourceText === 'string') {
      if (phase === 'generating' || phase === 'loading') void unload('تغير المصدر؛ أوقفنا العمل السابق. أعد اختيار النموذج.');
      requestId = message.requestId.slice(0, 100);
      $('source').value = message.sourceText.slice(0, 10000);
      $('source').readOnly = true;
      draft = null;
      $('result').textContent = '';
      if (phase === 'draft') status('ready', 'المصدر الحالي جاهز للتوليد.');
    } else if (message.type === 'unload') void unload();
  },
};
$('source').maxLength = MAX_SOURCE_CHARACTERS;
$('model').addEventListener('change', event => {
  const file = event.target.files?.[0];
  if (!file) return;
  const loading = loadModel(file, file.name);
  const candidate = selection;
  void loading.catch(error => {
    if (candidate !== selection) return;
    const message = error instanceof Error ? error.message : String(error);
    if (engine?.isModelLoaded()) status(phase, `${message.slice(0, 500)} النموذج السابق ما زال محمّلًا.`);
    else fail(error);
  });
});
$('generate').addEventListener('click', () => void generate().catch(fail));
$('smoke').addEventListener('click', () => void generate(true).catch(fail));
$('cancel').addEventListener('click', () => void unload('أوقفت العملية وأفرغنا النموذج. أعد اختيار الملف للبدء.'));
$('unload').addEventListener('click', () => void unload());
$('use-draft').addEventListener('click', () => { if (draft) { emit('result', draft); $('use-draft').hidden = true; } });
document.addEventListener('visibilitychange', () => { if (document.hidden) void unload('توقفت الجلسة عند مغادرة الشاشة لحماية الذاكرة.'); });
window.addEventListener('pagehide', () => void unload());
window.addEventListener('error', event => fail(event.error || event.message));
window.addEventListener('unhandledrejection', event => fail(event.reason));
$('diagnostic').hidden = !diagnostic;
status('idle', 'محرك تجريبي محلي. اختر نموذج GGUF من ملفاتك. لا يوجد نموذج مضمّن، ولم يُختبر على آيفونك بعد.');
emit('ready', { engine: AI_ENGINE_VERSION });
