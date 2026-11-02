/* Built with the pinned PDF.js package by build-engine.cjs. No network inputs. */
import { getDocument, version } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { WorkerMessageHandler } from 'pdfjs-dist/legacy/build/pdf.worker.mjs';
import { joinPdfText } from './layout';

// PDF.js's in-process worker avoids remote worker URLs and Blob workers in WKWebView.
// The entire parser runs inside the isolated WebView; no PDF scripts are executed.
globalThis.pdfjsWorker = { WorkerMessageHandler };
const MAX_BYTES = 10 * 1024 * 1024;
const MAX_PAGES = 50;
const MAX_CHARS = 1000000;

function failure(code, message) {
  const error = new Error(message); error.code = code; return error;
}

async function extract(request, progress = () => {}) {
  if (!request || typeof request.base64 !== 'string') {
    throw failure('INVALID_INPUT', 'بيانات PDF غير صالحة.');
  }
  if (!request.base64.length || request.base64.length > Math.ceil(MAX_BYTES / 3) * 4) {
    throw failure('FILE_LIMIT', 'الحد الأقصى لملف PDF هو 10 ميغابايت.');
  }
  if (request.base64.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(request.base64)) throw failure('INVALID_INPUT', 'بيانات PDF غير صالحة.');
  let raw;
  try { raw = atob(request.base64); }
  catch { throw failure('INVALID_INPUT', 'بيانات PDF غير صالحة.'); }
  if (raw.length > MAX_BYTES) throw failure('FILE_LIMIT', 'الحد الأقصى لملف PDF هو 10 ميغابايت.');
  if (!raw.slice(0, 1024).includes('%PDF-')) throw failure('INVALID_PDF', 'الملف لا يحتوي على ترويسة PDF صالحة.');
  const data = Uint8Array.from(raw, character => character.charCodeAt(0));
  const task = getDocument({ data, useWasm: false, useWorkerFetch: false, useSystemFonts: false,
    disableFontFace: true, isEvalSupported: false, enableXfa: false, disableRange: true,
    disableStream: true, disableAutoFetch: true, stopAtErrors: true, verbosity: 0 });
  try {
    const pdf = await task.promise;
    if (pdf.numPages > MAX_PAGES) throw failure('PAGE_LIMIT', 'استورد PDF من 50 صفحة أو أقل. قسّم الملفات الكبيرة أولًا.');
    const pages = [];
    let chars = 0;
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      // PDF.js resolves Unicode/bidi at extraction. Preserve order and page breaks;
      // do not reverse Arabic text, invent OCR, or normalize away source evidence.
      let text;
      try { text = joinPdfText(content.items, MAX_CHARS - chars); }
      catch { throw failure('TEXT_LIMIT', 'نص PDF أكبر من مليون حرف. قسّم الملف أولًا.'); }
      chars += text.length;
      pages.push({ pageNumber, text });
      page.cleanup();
      progress({ completed: pageNumber, total: pdf.numPages });
    }
    return { version, pageCount: pdf.numPages, pages,
      status: pages.some(page => page.text.trim()) ? 'text' : 'no-text',
      emptyPages: pages.filter(page => !page.text.trim()).map(page => page.pageNumber) };
  } catch (error) {
    if (error && error.name === 'PasswordException') throw failure('PASSWORD', 'الملف محمي بكلمة مرور. استخدم نسخة غير محمية تملك حق قراءتها.');
    if (error && error.code) throw error;
    throw failure('PARSE_FAILED', 'تعذّرت قراءة هذا PDF. قد يكون تالفًا أو يستخدم ترميزًا غير مدعوم.');
  } finally {
    await task.destroy();
  }
}

globalThis.RusukhPDF = { extract, version };
if (globalThis.ReactNativeWebView) globalThis.ReactNativeWebView.postMessage(JSON.stringify({ type: 'ready' }));
