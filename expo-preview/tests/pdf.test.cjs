const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const { makePdfResult, validatePdfPages } = require('../.test-build/pdf/contracts');
const { joinPdfText } = require('../.test-build/pdf/layout');
const generated = fs.readFileSync(path.join(__dirname, '../src/pdf/engine.generated.ts'), 'utf8');
const source = JSON.parse(generated.split('export const PDF_ENGINE_SOURCE = ')[1].trim().slice(0, -1));
const manifest = require('../src/pdf/engine-manifest.json');
// Run the exact shipped parser bundle, not a mock PDF reader. Node parsing is not
// a WKWebView/device test; native messaging is covered separately.
vm.runInThisContext(source, { filename: 'rusukh-pdf-engine.js' });
const parser = globalThis.RusukhPDF;
const fixture = name => fs.readFileSync(path.join(__dirname, 'fixtures/pdf', name)).toString('base64');

test('shipped engine matches its pinned SHA-256 and PDF.js version', () => {
  assert.equal(crypto.createHash('sha256').update(source).digest('hex'), manifest.engineSha256);
  assert.equal(parser.version, '6.5.438');
  assert.equal(manifest.externalAssets, false);
});

test('real two-page Arabic PDF extracts Arabic and Latin with page provenance and no fetch', async () => {
  const fetchBefore = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = async () => { requests++; throw new Error('Network forbidden in offline PDF test'); };
  try {
    const progress = [];
    const extracted = await parser.extract({ base64: fixture('arabic-visual-order.pdf') }, event => progress.push(event));
    assert.equal(extracted.status, 'text');
    assert.match(extracted.pages[0].text, /المراجعة المتباعدة تثبت المعرفة/);
    assert.match(extracted.pages[1].text, /العلم نور/);
    assert.match(extracted.pages[1].text, /English 123/);
    assert.deepEqual(progress, [{ completed: 1, total: 2 }, { completed: 2, total: 2 }]);
    const result = makePdfResult('محاضرة.pdf', extracted);
    assert.equal(result.title, 'محاضرة');
    assert.match(result.body, /\[صفحة 1\]/); assert.match(result.body, /\[صفحة 2\]/);
    assert.deepEqual(result.emptyPages, []);
    assert.ok(result.warnings.length, 'all PDF text requires review');
    assert.equal(requests, 0);
  } finally { globalThis.fetch = fetchBefore; }
});

test('real image-only PDF returns no-text without invented OCR', async () => {
  const extracted = await parser.extract({ base64: fixture('scanned-page.pdf') });
  const result = makePdfResult('صورة.pdf', extracted);
  assert.equal(result.status, 'no-text'); assert.equal(result.body, '');
  assert.deepEqual(result.emptyPages, [1]);
  assert.match(result.warnings[0], /لم نُجرِ OCR/);
});

test('mixed PDF retains the blank image page instead of silently dropping it', async () => {
  const extracted = await parser.extract({ base64: fixture('mixed-text-image.pdf') });
  const result = makePdfResult('مختلط.pdf', extracted);
  assert.equal(result.status, 'text'); assert.equal(result.pageCount, 2);
  assert.deepEqual(result.emptyPages, [2]); assert.match(result.body, /\[صفحة 2\]\nلم يُعثر/);
});

test('encrypted, invalid and over-page-limit PDFs fail with explicit errors', async () => {
  await assert.rejects(parser.extract({ base64: fixture('encrypted.pdf') }), { code: 'PASSWORD' });
  await assert.rejects(parser.extract({ base64: Buffer.from('not a PDF').toString('base64') }), { code: 'INVALID_PDF' });
  await assert.rejects(parser.extract({ base64: fixture('too-many-pages.pdf') }), { code: 'PAGE_LIMIT' });
});

test('invalid and over-limit base64 are rejected before parsing', async () => {
  await assert.rejects(parser.extract({ base64: '</script>' }), { code: 'INVALID_INPUT' });
  await assert.rejects(parser.extract({ base64: 'A===' }), { code: 'INVALID_INPUT' });
  await assert.rejects(parser.extract({ base64: 'A'.repeat(Math.ceil(10 * 1024 * 1024 / 3) * 4 + 4) }), { code: 'FILE_LIMIT' });
});

test('adjacent Arabic glyphs stay joined and geometry preserves word gaps', () => {
  const item = (str, x) => ({ str, width: 10, height: 20, transform: [20, 0, 0, 20, x, 100] });
  assert.equal(joinPdfText([item('ع', 200), item('ل', 190), item('م', 180), item('ن', 150), item('و', 140), item('ر', 130)]), 'علم نور');
  assert.equal(joinPdfText([{ str: 'abc', hasEOL: true }, { str: '123' }]), 'abc\n123');
  assert.throws(() => joinPdfText([{ str: 'long' }], 3), /PDF_TEXT_LIMIT/);
});

test('bridge result validation rejects reordered, oversized and malformed page data', () => {
  assert.equal(validatePdfPages({ pageCount: 1, pages: [{ pageNumber: 2, text: 'x' }] }), false);
  assert.equal(validatePdfPages({ pageCount: 1, pages: [{ pageNumber: 1, text: '\0' }] }), false);
  assert.equal(validatePdfPages({ pageCount: 1, pages: [{ pageNumber: 1, text: 'a'.repeat(1000001) }] }), false);
  assert.throws(() => makePdfResult('x.pdf', { pageCount: 1, pages: [] }));
});
