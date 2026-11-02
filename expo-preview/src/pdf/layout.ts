export type PdfTextItem = { str: string; hasEOL?: boolean; width?: number; height?: number; transform?: number[] };

/** Keep neighbouring glyphs joined; infer a word separator only from a visible gap. */
export function joinPdfText(items: PdfTextItem[], limit = 1000000): string {
  let text = '';
  let previous: PdfTextItem | undefined;
  for (const item of items) {
    if (typeof item.str !== 'string') continue;
    if (previous && text && !/\s$/.test(text) && !/^\s/.test(item.str)) {
      const a = previous.transform, b = item.transform;
      if (a && b && a.length >= 6 && b.length >= 6) {
        const height = Math.max(Math.abs(previous.height || a[3]), Math.abs(item.height || b[3]), 1);
        const gap = b[4] >= a[4] ? b[4] - (a[4] + Math.abs(previous.width || 0))
          : a[4] - (b[4] + Math.abs(item.width || 0));
        if (Math.abs(b[5] - a[5]) > height * 0.5) text += '\n';
        else if (gap > height * 0.12) text += ' ';
      }
    }
    text += item.str + (item.hasEOL ? '\n' : '');
    if (text.length > limit) throw new Error('PDF_TEXT_LIMIT');
    previous = item;
  }
  return text.replace(/[ \t]+\n/g, '\n').trim();
}
