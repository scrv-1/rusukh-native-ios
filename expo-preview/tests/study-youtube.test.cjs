const test = require('node:test');
const assert = require('node:assert/strict');
const { prepareYouTubeSource } = require('../.test-build/youtube.js');
const { parseQuestionAnswer } = require('../.test-build/core.js');
const url = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';

test('S004 YouTube: multiline answers include every contributing cue in their provenance', () => {
  const raw = '1\n00:00:10,000 --> 00:00:12,000\nس: ما الخطوات؟\n\n2\n00:00:13,000 --> 00:00:15,000\nج: أولًا اقرأ\nثم استرجع\n\n3\n00:00:01,000 --> 00:00:03,000\nثم تحقّق\n\n4\n00:00:20,000 --> 00:00:23,000\nس: متى؟\nج: لاحقًا';
  const source = prepareYouTubeSource(url, raw, 'srt');
  const first = source.questions[0];
  assert.equal(first.answer, 'أولًا اقرأ\nثم استرجع\nثم تحقّق');
  assert.deepEqual(first.segmentIds, source.segments.slice(0,3).map(segment => segment.id));
  assert.equal(first.startMs, 1000); assert.equal(first.endMs, 15000);
  assert.equal(first.url, url + '&t=10s');
  assert.deepEqual(parseQuestionAnswer(source.body), source.questions.map(({question,answer}) => ({question,answer})));
  assert.equal(source.originalText, raw);
});

test('S004 YouTube: plain-text paragraphs survive extraction and stop at source/quote boundaries', () => {
  const raw = 'Q: Explain\nthis idea?\nA: First paragraph.\n\nSecond paragraph.\n---\nUnrelated narration.\n> Q: Quoted?\n> A: Excluded.\n```\nQ: Code?\nA: Excluded.\n```\nس: سؤال ثان؟\nج: جواب ثان';
  const source = prepareYouTubeSource(url, raw, 'text');
  assert.deepEqual(source.questions.map(({question,answer}) => ({question,answer})), [
    {question:'Explain\nthis idea?',answer:'First paragraph.\n\nSecond paragraph.'},
    {question:'سؤال ثان؟',answer:'جواب ثان'},
  ]);
  assert.deepEqual(source.questions[0].segmentIds, source.segments.slice(0,2).map(segment => segment.id));
  assert.deepEqual(parseQuestionAnswer(source.body), source.questions.map(({question,answer}) => ({question,answer})));
});

test('S004 YouTube: VTT visible continuation preserves cue ids and ignores NOTE metadata', () => {
  const raw = 'WEBVTT\n\nNOTE metadata\nQ: Hidden?\nA: No\n\nc1\n00:01.000 --> 00:02.000\nQ: Name\nthese?\n\nc2\n00:03.000 --> 00:04.000\nA: One\nTwo\n\nc3\n00:05.000 --> 00:06.000\nThree\n\nc4\n00:07.000 --> 00:08.000\nمرجع السؤال: local reference';
  const source = prepareYouTubeSource(url, raw, 'vtt');
  assert.equal(source.questions.length, 1);
  assert.equal(source.questions[0].question, 'Name\nthese?');
  assert.equal(source.questions[0].answer, 'One\nTwo\nThree');
  assert.deepEqual(source.questions[0].segmentIds, source.segments.slice(0,3).map(segment => segment.id));
  assert.equal(source.questions[0].endMs, 6000);
});
