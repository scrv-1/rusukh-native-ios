import type { Note, StudyCard, Grade, Backup } from './types';

export const MS_DAY = 24 * 60 * 60 * 1000;
// Import and export must use the same UTF-8 wire-size limit.
export const MAX_BACKUP_BYTES = 15 * 1024 * 1024;

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
  const lines = body.split(/\r?\n/);
  const result: { question: string; answer: string }[] = [];
  let question = '';
  for (const raw of lines) {
    const line = raw.trim();
    const q = line.match(/^(?:س\s*[:：]|Q\s*[:：])\s*(.+)$/i);
    const a = line.match(/^(?:ج\s*[:：]|A\s*[:：])\s*(.+)$/i);
    if (q) question = q[1].trim();
    else if (a && question) {
      result.push({ question, answer: a[1].trim() });
      question = '';
    }
  }
  return result.filter(({ question: q, answer: a }) => q.length > 0 && a.length > 0);
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
        !Number.isFinite(item.intervalDays) || item.intervalDays < 0 || item.intervalDays > 365000 ||
        !Number.isFinite(item.ease) || item.ease < 1 || item.ease > 5 ||
        !Number.isInteger(item.repetitions) || item.repetitions < 0 || item.repetitions > 100000 || cardIds.has(item.id)) return false;
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
