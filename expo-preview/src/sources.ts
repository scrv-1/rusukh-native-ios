export const MAX_SOURCE_BYTES = 1024 * 1024;
export const MAX_NOTE_CHARS = 1000000;

/** Text supplied by the student; no network request and no generated answers. */
export function prepareSource(filename: string, text: string): { title: string; body: string } {
  const extension = filename.split('.').pop()?.toLowerCase();
  if (!['txt', 'md', 'srt', 'vtt'].includes(extension ?? '')) {
    throw new Error('اختر ملف TXT أو MD أو SRT أو VTT. قراءة PDF ليست مضافة لهذه النسخة.');
  }
  if (text.length > MAX_SOURCE_BYTES) throw new Error('النص أكبر من الحد المسموح.');
  const clean = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').trim();
  if (!clean || clean.includes('\u0000') || clean.includes('\uFFFD')) throw new Error('الملف فارغ أو ترميزه غير مدعوم. استخدم UTF-8.');
  const body = `المصدر: ${filename}\n\n${clean}`;
  if (body.length > MAX_NOTE_CHARS) throw new Error('النص أطول من حد الملاحظة القابلة للنسخ الاحتياطي.');
  // Preserve timestamps and cue identifiers: source evidence is more important than prettifying.
  return { title: filename.replace(/\.[^.]+$/, '').slice(0, 160).trim() || 'مصدر جديد',
    body };
}

export function normalizeSearch(text: string): string {
  return text.normalize('NFKC').replace(/[\u064B-\u065F\u0670\u0640]/g, '')
    .replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').toLocaleLowerCase().replace(/\s+/g, ' ').trim();
}

export function matchesSearch(title: string, body: string, query: string): boolean {
  const words = normalizeSearch(query).split(' ').filter(Boolean);
  const haystack = normalizeSearch(`${title} ${body}`);
  return words.every(word => haystack.includes(word));
}

export function markdownNote(title: string, body: string): string {
  return `# ${title.replace(/[\r\n]/g, ' ')}\n\n${body}\n`;
}
