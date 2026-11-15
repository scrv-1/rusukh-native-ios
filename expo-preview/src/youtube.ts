import { parseQuestionAnswerWithLines, utf8ByteLength } from './core';
import { MAX_NOTE_CHARS, MAX_SOURCE_BYTES } from './sources';

export type YouTubeVideo = { videoId: string; canonicalUrl: string; startSeconds: number };
export type TranscriptFormat = 'srt' | 'vtt' | 'text';
export type TranscriptSegment = {
  id: string; cueId: string | null; sourceLabel: string; sourceLine: number;
  startMs: number | null; endMs: number | null; text: string; raw: string;
};
export type VideoSegment = TranscriptSegment & { videoId: string; url: string };
export type WrittenQuestion = {
  question: string; answer: string; segmentIds: string[];
  startMs: number | null; endMs: number | null; url: string;
};
export type YouTubeSource = {
  title: string; body: string; originalText: string; format: TranscriptFormat;
  video: YouTubeVideo; segments: VideoSegment[]; questions: WrittenQuestion[];
  method: 'written-qa';
};
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
// Application resource bound, not a claim about YouTube's maximum video duration.
const MAX_SECONDS = 7 * 24 * 60 * 60;

function urlTime(value: string): number | null {
  let seconds: number;
  if (/^\d+$/.test(value)) seconds = Number(value);
  else {
    const match = value.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
    if (!match || !match.slice(1).some(Boolean)) return null;
    seconds = Number(match[1] ?? 0) * 3600 + Number(match[2] ?? 0) * 60 + Number(match[3] ?? 0);
  }
  return Number.isSafeInteger(seconds) && seconds >= 0 && seconds <= MAX_SECONDS ? seconds : null;
}

/** Validation only: no request to YouTube and no proof that the video is available. */
export function parseYouTubeUrl(input: string): YouTubeVideo | null {
  if (typeof input !== 'string' || input.length > 2048 || /[\u0000-\u001F\u007F\\]/.test(input)) return null;
  try {
    const url = new URL(input.trim());
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
    const host = url.hostname.toLowerCase();
    let videoId: string | null = null;
    if (host === 'youtu.be') {
      const match = url.pathname.match(/^\/([A-Za-z0-9_-]{11})\/?$/);
      videoId = match?.[1] ?? null;
    } else if (['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com'].includes(host)) {
      if (url.pathname === '/watch' && url.searchParams.getAll('v').length === 1) videoId = url.searchParams.get('v');
      else videoId = url.pathname.match(/^\/(?:shorts|live|embed)\/([A-Za-z0-9_-]{11})\/?$/)?.[1] ?? null;
    } else if (['youtube-nocookie.com', 'www.youtube-nocookie.com'].includes(host)) {
      videoId = url.pathname.match(/^\/embed\/([A-Za-z0-9_-]{11})\/?$/)?.[1] ?? null;
    }
    if (!videoId || !VIDEO_ID.test(videoId)) return null;
    const times = [...url.searchParams.getAll('t'), ...url.searchParams.getAll('start')];
    if (url.hash.startsWith('#t=')) times.push(url.hash.slice(3));
    if (times.length > 1) return null;
    const startSeconds = times.length ? urlTime(times[0]) : 0;
    if (startSeconds === null) return null;
    return { videoId, canonicalUrl: `https://www.youtube.com/watch?v=${videoId}`, startSeconds };
  } catch { return null; }
}

/** startMs is a cue timestamp. YouTube may seek to a nearby keyframe. */
export function youtubeAt(videoId: string, startMs: number): string {
  if (!VIDEO_ID.test(videoId) || !Number.isFinite(startMs) || startMs < 0 || startMs > MAX_SECONDS * 1000) {
    throw new Error('رابط الفيديو أو توقيته غير صالح.');
  }
  return `https://www.youtube.com/watch?v=${videoId}&t=${Math.floor(startMs / 1000)}s`;
}

function subtitleTime(value: string, format: TranscriptFormat): number | null {
  const match = value.match(format === 'srt' ? /^(\d{2,}):(\d{2}):(\d{2})[,.](\d{3})$/ : /^(?:(\d{2,}):)?(\d{2}):(\d{2})\.(\d{3})$/);
  if (!match) return null;
  const hours = Number(match[1] ?? 0), minutes = Number(match[2]), seconds = Number(match[3]);
  const total = ((hours * 60 + minutes) * 60 + seconds) * 1000 + Number(match[4]);
  return minutes < 60 && seconds < 60 && total <= MAX_SECONDS * 1000 ? total : null;
}

function visibleCueText(raw: string): string {
  // Strip known caption markup only; never execute it or interpret arbitrary HTML.
  return raw.replace(/<\/?(?:b|i|u|c(?:\.[\w-]+)*|v(?:\s+[^<>]*)?|lang(?:\s+[^<>]*)?|ruby|rt)>/g, '')
    .replace(/<\d{2}:\d{2}(?::\d{2})?\.\d{3}>/g, '')
    .replace(/&(amp|lt|gt|quot|apos|nbsp);/g, (_, name: string) => ({ amp:'&', lt:'<', gt:'>', quot:'"', apos:"'", nbsp:' ' })[name]!)
    .trim();
}

/** Parses supplied text offline. Reject malformed cues rather than silently dropping evidence. */
export function parseTranscript(text: string, format: TranscriptFormat, sourceLabel: string): TranscriptSegment[] {
  if (!['srt','vtt','text'].includes(format) || typeof text !== 'string' || !text.trim()
    || text.includes('\u0000') || text.includes('\uFFFD') || utf8ByteLength(text) > MAX_SOURCE_BYTES) {
    throw new Error('التفريغ فارغ أو غير صالح. استخدم نص UTF-8 أو SRT أو VTT حتى 1 ميغابايت.');
  }
  if (typeof sourceLabel !== 'string' || sourceLabel.length > 200 || /[\r\n\u0000]/.test(sourceLabel)) throw new Error('اسم المصدر غير صالح.');
  const lines = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split('\n');
  const blocks: { lines: string[]; line: number }[] = [];
  for (let i = 0; i < lines.length;) {
    if (!lines[i].trim()) { i++; continue; }
    const start = i;
    while (i < lines.length && lines[i].trim()) i++;
    blocks.push({ lines: lines.slice(start,i), line: start+1 });
  }
  if (format === 'vtt') {
    if (!/^WEBVTT(?:\s|$)/.test(blocks[0]?.lines[0] ?? '')) throw new Error('ملف VTT يفتقد ترويسة WEBVTT.');
    blocks.shift();
  }
  const segments: TranscriptSegment[] = [];
  for (const block of blocks) {
    const raw = block.lines.join('\n');
    if (format === 'vtt' && /^(?:NOTE(?:\s|$)|STYLE$|REGION$)/.test(block.lines[0])) continue;
    if (segments.length >= 5000) throw new Error('التفريغ يتجاوز 5000 مقطع. قسّمه إلى ملفات أصغر.');
    if (format === 'text') {
      segments.push({id:`segment-${block.line}`,cueId:null,sourceLabel,sourceLine:block.line,startMs:null,endMs:null,text:raw,raw});
      continue;
    }
    const timingIndex = block.lines[0].includes('-->') ? 0 : 1;
    const timing = block.lines[timingIndex]?.match(/^(\S+)\s+-->\s+(\S+)(?:\s+.*)?$/);
    const startMs = timing ? subtitleTime(timing[1],format) : null;
    const endMs = timing ? subtitleTime(timing[2],format) : null;
    const content = visibleCueText(block.lines.slice(timingIndex+1).join('\n'));
    if (startMs === null || endMs === null || endMs <= startMs || !content) {
      throw new Error(`مقطع تفريغ غير صالح عند السطر ${block.line}. راجع التوقيت والنص.`);
    }
    segments.push({id:`segment-${block.line}`,cueId:timingIndex ? block.lines[0] : null,sourceLabel,sourceLine:block.line,startMs,endMs,text:content,raw});
  }
  if (!segments.length) throw new Error('لا توجد مقاطع نصية قابلة للقراءة في الملف.');
  return segments;
}

function explicitQuestions(segments: VideoSegment[], format: TranscriptFormat): WrittenQuestion[] {
  const lines: string[] = [];
  const lineSources: (VideoSegment | null)[] = [];
  let previous: VideoSegment | null = null;
  for (const segment of segments) {
    // Text blocks are paragraphs; subtitle cue breaks are timing boundaries.
    // Preserve original text paragraph spacing instead of merging paragraphs.
    if (format === 'text' && previous) {
      const gap = segment.sourceLine - previous.sourceLine - previous.text.split('\n').length;
      for (let i = 0; i < gap; i++) { lines.push(''); lineSources.push(null); }
    }
    for (const line of segment.text.split('\n')) { lines.push(line); lineSources.push(segment); }
    previous = segment;
  }
  return parseQuestionAnswerWithLines(lines.join('\n')).map(({ question, answer, lineStart, lineEnd }) => {
    const contributing = new Map<string, VideoSegment>();
    for (let line = lineStart; line <= lineEnd; line++) {
      const segment = lineSources[line];
      if (segment) contributing.set(segment.id, segment);
    }
    const sources = [...contributing.values()];
    // Captions may overlap or be out of time order. Keep source encounter order
    // and the question's URL while spanning all contributing answer cues.
    const starts = sources.map(segment => segment.startMs).filter((time): time is number => time !== null);
    const ends = sources.map(segment => segment.endMs).filter((time): time is number => time !== null);
    return { question, answer, segmentIds: [...contributing.keys()],
      startMs: starts.length ? Math.min(...starts) : null,
      endMs: ends.length ? Math.max(...ends) : null, url: sources[0].url };
  });
}

/** Builds a reviewable note draft; does not download audio, captions, or generate AI answers. */
export function prepareYouTubeSource(url: string, text: string, format: TranscriptFormat, title = 'تفريغ YouTube'): YouTubeSource {
  const video = parseYouTubeUrl(url);
  if (!video) throw new Error('أدخل رابط HTTPS صحيحًا لفيديو YouTube.');
  const name = title.trim();
  if (!name || name.length > 160 || /[\r\n\u0000]/.test(name)) throw new Error('اكتب عنوانًا من 1 إلى 160 حرفًا.');
  const baseUrl = video.startSeconds > 0 ? youtubeAt(video.videoId, video.startSeconds*1000) : video.canonicalUrl;
  const segments: VideoSegment[] = parseTranscript(text,format,name).map(segment => ({...segment,
    videoId:video.videoId,url:segment.startMs === null ? baseUrl : youtubeAt(video.videoId,segment.startMs)}));
  const originalText = text;
  const questions = explicitQuestions(segments, format);
  const writtenQuestions = questions.length
    ? `أسئلة وأجوبة مكتوبة في التفريغ — استخراج حرفي دون ذكاء اصطناعي:\n\n${questions.map(question =>
      `س: ${question.question}\nج: ${question.answer}\nمرجع السؤال: ${question.url}\nمقاطع المصدر: ${question.segmentIds.join('، ')}`
    ).join('\n\n')}`
    : 'لا توجد أسئلة وأجوبة مكتوبة بصيغة س:/ج: في المقاطع النصية.';
  // Only validated visible Q/A lines may reach the note's card parser. Quote
  // every original line, including VTT metadata, without changing its contents.
  const quotedOriginal = originalText.split('\n').map(line => `> ${line}`).join('\n');
  const body = `المصدر: ${name}\nرابط الفيديو: ${baseUrl}\nنوع التفريغ: ${format.toUpperCase()} — نص يقدّمه الطالب\n\n${writtenQuestions}\n\nالتفريغ الأصلي — اقتباس للمراجعة:\n${quotedOriginal}`;
  if (body.length > MAX_NOTE_CHARS) throw new Error('التفريغ يتجاوز حد طول الملاحظة.');
  return { title:name,body,originalText,format,video,segments,questions,method:'written-qa' };
}
