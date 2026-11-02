export const MAX_PDF_BYTES = 10 * 1024 * 1024;
export const PDF_TIMEOUT_MS = 30000;
export type PdfRequest = { id: string; filename: string; base64: string };
export type PdfProgress = { completed: number; total: number };
export type PdfPage = { pageNumber: number; text: string };
export type PdfResult = { status: 'text' | 'no-text'; title: string; body: string;
  pageCount: number; pages: PdfPage[]; emptyPages: number[]; warnings: string[] };
export type PdfError = { code: string; message: string };

/** Treat WebView messages as untrusted input and cap every field before use. */
export function validatePdfPages(value: unknown): value is { pageCount: number; pages: PdfPage[] } {
  if (!value || typeof value !== 'object') return false;
  const data = value as Record<string, unknown>;
  if (!Number.isInteger(data.pageCount) || Number(data.pageCount) < 1 || Number(data.pageCount) > 50 || !Array.isArray(data.pages) || data.pages.length !== data.pageCount) return false;
  let length = 0;
  return data.pages.every((page, index) => {
    if (!page || typeof page !== 'object' || page.pageNumber !== index + 1 || typeof page.text !== 'string' || page.text.includes('\u0000')) return false;
    length += page.text.length;
    return length <= 1000000;
  });
}

export function makePdfResult(filename: string, data: unknown): PdfResult {
  if (!validatePdfPages(data)) throw new Error('نتيجة قراءة PDF غير صالحة.');
  const safeName = filename.replace(/[\r\n\u0000-\u001F]/g, ' ').slice(0, 250);
  const emptyPages = data.pages.filter(page => !page.text.trim()).map(page => page.pageNumber);
  const status = emptyPages.length === data.pageCount ? 'no-text' : 'text';
  const body = status === 'no-text' ? '' : `المصدر: ${safeName}\nنوع المصدر: PDF\nعدد الصفحات: ${data.pageCount}\n\n` +
    data.pages.map(page => `[صفحة ${page.pageNumber}]\n${page.text.trim() || 'لم يُعثر على نص قابل للاستخراج في هذه الصفحة؛ قد تحتاج إلى OCR.'}`).join('\n\n');
  // The destination note/backup already has a one-million-character contract.
  if (body.length > 1000000) throw new Error('نص PDF مع توثيق الصفحات يتجاوز حد الملاحظة. قسّم الملف أولًا.');
  return { status, title: safeName.replace(/\.pdf$/i, '').slice(0, 160).trim() || 'مصدر PDF', body,
    pageCount: data.pageCount, pages: data.pages, emptyPages,
    warnings: status === 'no-text' ? ['لم نجد نصًا قابلًا للاستخراج. الملف قد يكون مصوّرًا؛ لم نُجرِ OCR.']
      : ['راجع النص قبل حفظه، خصوصًا ترتيب العربية والجداول والرموز؛ استخراج PDF لا يضمن مطابقة الأصل.',
        ...(emptyPages.length ? [`صفحات بلا نص قابل للاستخراج: ${emptyPages.join('، ')}. لم نُجرِ OCR.`] : [])] };
}
