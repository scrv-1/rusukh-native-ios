import type { Note, StudyCard, Grade, Backup } from './types';

export const MS_DAY = 24 * 60 * 60 * 1000;
// Import and export must use the same UTF-8 wire-size limit.
export const MAX_BACKUP_BYTES = 15 * 1024 * 1024;
// The scheduler and backup validator share these persistence limits. A valid
// imported card must stay exportable after any subsequent review.
export const MAX_INTERVAL_DAYS = 365000;
export const MAX_REPETITIONS = 100000;

export function utf8ByteLength(text: string): number {
  let bytes = 0;
  // Iterate code points so surrogate pairs count as four bytes. Unmatched
  // surrogates encode as the three-byte replacement character, as in UTF-8.
  for (const character of text) {
    const point = character.codePointAt(0)!;
    bytes += point <= 0x7f ? 1 : point <= 0x7ff ? 2 : point <= 0xffff ? 3 : 4;
  }
  return bytes;
}

export function serializeBackup(backup: Backup): string {
  if (!validateBackup(backup)) throw new Error('ملف النسخة الاحتياطية غير صالح للاستعادة.');
  const text = JSON.stringify(backup, null, 2);
  if (utf8ByteLength(text) > MAX_BACKUP_BYTES) {
    throw new Error('النسخة أكبر من 15 ميغابايت، وهو حد الاستيراد الحالي. لم يُنشأ ملف نسخة احتياطية.');
  }
  return text;
}

export function makeId(prefix: string, now = Date.now()): string {
  return `${prefix}-${now.toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

export function normalizeTitle(input: string): string {
  return input.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}

// Keep the established [[target|alias]] grammar. Reject ambiguous new titles
// at the editor/link-creation boundary, without reinterpreting existing notes.
export function wikiLinkTitleError(title: string): string | null {
  return /[\]|\r\n]/.test(title)
    ? 'العنوان لا يدعم الروابط إذا احتوى | أو ] أو سطرًا جديدًا. استخدم عنوانًا آخر.'
    : null;
}

// Match the existing wiki syntax in one pass. In particular, '[' is allowed
// inside a target/alias; ']' and LF terminate an unsuccessful candidate. A
// backtracking regex rescans every opener in long, unclosed bracket runs.
function forEachWikiLink(body: string, visit: (start: number, end: number, target: string, alias: string | undefined) => void): void {
  let start = -1;
  let pipe = -1;
  for (let index = 0; index < body.length; index++) {
    const character = body[index];
    if (character === '\n' || character === ']') {
      if (character === ']' && start >= 0 && body[index + 1] === ']') {
        visit(start, index + 2, body.slice(start + 2, pipe < 0 ? index : pipe),
          pipe < 0 ? undefined : body.slice(pipe, index));
        index++; // Global matches resume after both closing brackets.
      }
      start = -1;
      pipe = -1;
    } else if (start < 0) {
      const firstTarget = body[index + 2];
      if (character === '[' && body[index + 1] === '[' && firstTarget !== undefined &&
          firstTarget !== ']' && firstTarget !== '|' && firstTarget !== '\n') {
        start = index;
      }
    } else if (character === '|' && pipe < 0) {
      pipe = index;
    }
  }
}

// The shared parser keeps graph discovery and rename propagation in agreement.
// Changed spans are assembled once, leaving unrelated/malformed text untouched.
export function replaceWikiLinks(body: string, replace: (full: string, target: string, alias: string | undefined) => string): string {
  const parts: string[] = [];
  let copied = 0;
  forEachWikiLink(body, (start, end, target, alias) => {
    const full = body.slice(start, end);
    const replacement = replace(full, target, alias);
    if (replacement !== full) {
      parts.push(body.slice(copied, start), replacement);
      copied = end;
    }
  });
  return copied === 0 ? body : parts.join('') + body.slice(copied);
}

export function wikiLinks(body: string): string[] {
  const found: string[] = [];
  const seen = new Set<string>();
  forEachWikiLink(body, (_start, _end, target) => {
    const name = target.trim();
    const key = normalizeTitle(name);
    // Normalize each target once; retain its first spelling and encounter order.
    if (name && !seen.has(key)) {
      seen.add(key);
      found.push(name);
    }
  });
  return found;
}

export function graphEdges(notes: Pick<Note, 'id' | 'title' | 'body'>[]): { from: string; to: string }[] {
  const index = new Map(notes.map((note) => [normalizeTitle(note.title), note.id]));
  const edges: { from: string; to: string }[] = [];
  const targetsBySource = new Map<string, Set<string>>();
  for (const note of notes) {
    // Share the set across repeated source IDs, matching the previous global
    // edge deduplication while avoiding a scan of every preceding edge.
    let targets = targetsBySource.get(note.id);
    if (!targets) { targets = new Set<string>(); targetsBySource.set(note.id, targets); }
    for (const title of wikiLinks(note.body)) {
      const id = index.get(normalizeTitle(title));
      if (id && id !== note.id && !targets.has(id)) {
        targets.add(id);
        edges.push({ from: note.id, to: id });
      }
    }
  }
  return edges;
}

// Human-authored Q/A is parsed explicitly; this is not an AI card generator.
export function parseQuestionAnswer(body: string): { question: string; answer: string }[] {
  return parseQuestionAnswerWithLines(body).map(({ question, answer }) => ({ question, answer }));
}

// Zero-based inclusive line spans let transcript extraction retain every source
// cue without implementing a second, incompatible Q/A grammar.
export function parseQuestionAnswerWithLines(body: string): { question: string; answer: string; lineStart: number; lineEnd: number }[] {
  const result: { question: string; answer: string; lineStart: number; lineEnd: number }[] = [];
  let question: string[] | null = null;
  let answer: string[] | null = null;
  let lineStart = -1;
  let lineEnd = -1;
  let fence: { character: string; length: number } | null = null;
  const finish = () => {
    const q = question?.join('\n').trim();
    const a = answer?.join('\n').trim();
    if (q && a) result.push({ question: q, answer: a, lineStart, lineEnd });
    question = null;
    answer = null;
    lineStart = -1;
    lineEnd = -1;
  };
  for (const [lineIndex, raw] of body.split(/\r\n?|\n/).entries()) {
    const line = raw.trim();
    if (fence) {
      const closing = line.match(/^(`{3,}|~{3,})\s*$/);
      if (closing && closing[1][0] === fence.character && closing[1].length >= fence.length) fence = null;
      continue;
    }
    const opening = line.match(/^(`{3,}|~{3,})/);
    if (opening) {
      finish();
      fence = { character: opening[1][0], length: opening[1].length };
      continue;
    }
    // These are explicit boundaries in the app's source/AI note formats.
    // Quoted transcripts and code examples must not create extra cards.
    if (/^>/.test(line) || /^#{1,6}\s/.test(line) || /^(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line) ||
        /^(?:الشاهد|مرجع السؤال|مقاطع المصدر|المصدر|النموذج|رابط الفيديو|نوع التفريغ)\s*[:：]/.test(line) ||
        /^النص الذي (?:استُخدم|استخدم)\s*[:：]/.test(line) || /^التفريغ الأصلي(?:\s|[:：—–-]|$)/.test(line)) {
      finish();
      continue;
    }
    const q = line.match(/^(?:س\s*[:：]|Q\s*[:：])\s*(.*)$/i);
    const a = line.match(/^(?:ج\s*[:：]|A\s*[:：])\s*(.*)$/i);
    if (q) { finish(); question = [q[1]]; lineStart = lineIndex; }
    else if (a) {
      // A second A: without a new Q: is an orphan, not a continuation.
      if (answer !== null) finish();
      if (question !== null) { answer = [a[1]]; lineEnd = lineIndex; }
    } else if (answer !== null) {
      answer.push(raw.trimEnd());
      if (line) lineEnd = lineIndex;
    }
    else if (question !== null) question.push(raw.trimEnd());
  }
  finish();
  return result;
}

export function scheduleReview(card: StudyCard, grade: Grade, now: number): StudyCard {
  const ease = Math.max(1.3, Math.min(3.0,
    card.ease + (grade === 'easy' ? 0.15 : grade === 'hard' ? -0.15 : grade === 'again' ? -0.2 : 0)
  ));
  const hardDays = Math.max(1, Math.ceil(card.intervalDays * 1.2));
  // Compare grades from the same incoming state. The initial Good steps must
  // not shorten a longer interval earned by Easy (or restored from a backup).
  // Use Good's unchanged, bounded ease even when computing Easy's lower bound.
  const goodDays = Math.max(hardDays, card.repetitions === 0 ? 1 : card.repetitions === 1 ? 3 :
    Math.ceil(card.intervalDays * Math.max(1.3, Math.min(3.0, card.ease))));
  let intervalDays = 0;
  let repetitions = card.repetitions;
  if (grade === 'again') {
    repetitions = 0;
    intervalDays = 0;
  } else if (grade === 'hard') {
    repetitions += 1;
    intervalDays = hardDays;
  } else if (grade === 'good') {
    repetitions += 1;
    intervalDays = goodDays;
  } else {
    repetitions += 1;
    intervalDays = Math.max(goodDays, card.repetitions === 0 ? 4 : Math.max(4, Math.ceil(card.intervalDays * ease * 1.3)));
  }
  intervalDays = Math.min(MAX_INTERVAL_DAYS, intervalDays);
  repetitions = Math.min(MAX_REPETITIONS, repetitions);
  return {
    ...card,
    ease,
    repetitions,
    intervalDays,
    dueAt: grade === 'again' ? now + 10 * 60 * 1000 : now + intervalDays * MS_DAY,
    updatedAt: now,
  };
}

export function dueCards(cards: StudyCard[], now = Date.now()): StudyCard[] {
  return cards.filter((card) => card.dueAt <= now).sort((a, b) => a.dueAt - b.dueAt);
}

function shuffled<T>(items: readonly T[], random: () => number): T[] {
  const result = [...items];
  // Fisher–Yates: sample only the remaining range; never mutate stored cards.
  for (let last = result.length - 1; last > 0; last--) {
    const selected = Math.floor(random() * (last + 1));
    [result[last], result[selected]] = [result[selected], result[last]];
  }
  return result;
}

export type PracticeCard = { cardId: string; noteId: string; question: string; answer: string };

// A recall session needs no unrelated answer options. Copy a bounded snapshot
// so parent reloads or card edits cannot replace a question halfway through.
export function makePracticeSession(cards: readonly StudyCard[], limit = 8, random: () => number = Math.random): PracticeCard[] {
  const count = Number.isFinite(limit) ? Math.min(8, Math.max(0, Math.trunc(limit))) : 0;
  if (!count) return [];
  const ids = new Set<string>();
  const prompts = new Set<string>();
  const candidates: PracticeCard[] = [];
  for (const card of cards) {
    if (!card.question.trim() || !card.answer.trim()) continue;
    const key = JSON.stringify([normalizeTitle(card.question), normalizeTitle(card.answer)]);
    if (ids.has(card.id) || prompts.has(key)) continue;
    ids.add(card.id);
    prompts.add(key);
    candidates.push({ cardId: card.id, noteId: card.noteId, question: card.question, answer: card.answer });
  }
  return shuffled(candidates, random).slice(0, count);
}

/** @deprecated Unrelated card answers are not verified distractors. Use makePracticeSession for user-facing practice. */
// random follows Math.random's [0, 1) contract; tests can inject a seeded source.
export function makeQuiz(cards: readonly StudyCard[], limit = 8, random: () => number = Math.random) {
  const count = Number.isFinite(limit) ? Math.max(0, Math.trunc(limit)) : 0;
  if (count === 0) return [];
  const candidates = cards.filter(card => card.question.trim() && card.answer.trim());
  const answers = new Map(candidates.map(card => [normalizeTitle(card.answer), card.answer]));
  if (answers.size < 2) return [];
  // Deduplicate options, not questions: two cards may legitimately share an answer.
  return shuffled(candidates, random).slice(0, count).map(card => {
    const answerKey = normalizeTitle(card.answer);
    const distractors = shuffled([...answers].filter(([key]) => key !== answerKey), random)
      .slice(0, 3).map(([, answer]) => answer);
    return { cardId: card.id, question: card.question, answer: card.answer,
      options: shuffled([card.answer, ...distractors], random) };
  });
}

export function validateBackup(value: unknown): value is Backup {
  if (typeof value !== 'object' || !value) return false;
  const data = value as Record<string, unknown>;
  if (data.format !== 'rusukh-backup' || data.version !== 1 ||
      !Array.isArray(data.notes) || !Array.isArray(data.cards) || !Array.isArray(data.reviews) ||
      data.notes.length > 10000 || data.cards.length > 50000 || data.reviews.length > 100000) return false;
  const str = (x: unknown) => typeof x === 'string' && x.length <= 1000000;
  // Restored identifiers and titles must also fit the editor's recovery slot.
  // Reject incompatible input before the restore transaction replaces data.
  const id = (x: unknown) => typeof x === 'string' && x.length > 0 && x.length <= 200;
  const noteTitle = (x: unknown) => typeof x === 'string' && x.trim().length > 0 && x.length <= 160;
  const time = (x: unknown) => typeof x === 'number' && Number.isFinite(x) && x >= 0;
  const noteIds = new Set<string>();
  const noteTitles = new Set<string>();
  for (const item of data.notes) {
    if (!item || !id(item.id) || !noteTitle(item.title) || !str(item.body) ||
        !time(item.createdAt) || !time(item.updatedAt) || noteIds.has(item.id)) return false;
    const title = normalizeTitle(item.title);
    if (noteTitles.has(title)) return false;
    noteIds.add(item.id);
    noteTitles.add(title);
  }
  const cardIds = new Set<string>();
  for (const item of data.cards) {
    if (!item || !id(item.id) || !id(item.noteId) || !noteIds.has(item.noteId) ||
        !str(item.question) || !str(item.answer) || !time(item.dueAt) || !time(item.updatedAt) ||
        !Number.isFinite(item.intervalDays) || item.intervalDays < 0 || item.intervalDays > MAX_INTERVAL_DAYS ||
        !Number.isFinite(item.ease) || item.ease < 1 || item.ease > 5 ||
        !Number.isInteger(item.repetitions) || item.repetitions < 0 || item.repetitions > MAX_REPETITIONS || cardIds.has(item.id)) return false;
    cardIds.add(item.id);
  }
  const reviewIds = new Set<string>();
  for (const item of data.reviews) {
    if (!item || !id(item.id) || !id(item.cardId) || !cardIds.has(item.cardId) ||
        !['again', 'hard', 'good', 'easy'].includes(item.grade) || !time(item.reviewedAt) || reviewIds.has(item.id)) return false;
    reviewIds.add(item.id);
  }
  return true;
}

