const test = require('node:test');
const assert = require('node:assert/strict');
const {parseYouTubeUrl, youtubeAt, parseTranscript, prepareYouTubeSource} = require('../.test-build/youtube.js');
const {parseQuestionAnswer} = require('../.test-build/core.js');
const id = 'dQw4w9WgXcQ';

test('recognizes official watch, short, live, embed and no-cookie video URLs', () => {
  for (const url of [
    `https://www.youtube.com/watch?v=${id}`, `https://youtube.com/watch?v=${id}&feature=share`,
    `https://m.youtube.com/watch?v=${id}`, `https://youtu.be/${id}?si=share`,
    `https://www.youtube.com/shorts/${id}`, `https://youtube.com/live/${id}`,
    `https://www.youtube.com/embed/${id}`, `https://www.youtube-nocookie.com/embed/${id}`,
  ]) {
    assert.equal(parseYouTubeUrl(url).videoId, id);
    assert.equal(parseYouTubeUrl(url).canonicalUrl, `https://www.youtube.com/watch?v=${id}`);
  }
});
test('rejects deceptive hosts, credentials, unsupported protocol, ports and paths', () => {
  for (const url of [
    `https://youtube.com.evil.example/watch?v=${id}`, `https://evil-youtube.com/watch?v=${id}`,
    `https://youtube.com@evil.example/watch?v=${id}`, `https://user:pass@youtube.com/watch?v=${id}`,
    `http://youtube.com/watch?v=${id}`, `javascript:alert(1)`, `file:///watch?v=${id}`,
    `https://youtube.com:8443/watch?v=${id}`, `https://youtube.com/redirect?q=https://youtu.be/${id}`,
    `https://youtu.be/${id}/other`, `https://youtube.com/channel/${id}`, `https://youtube-nocookie.com/watch?v=${id}`,
  ]) assert.equal(parseYouTubeUrl(url), null, url);
});
test('rejects missing, invalid, ambiguous and malformed video identifiers', () => {
  for (const url of [
    'https://youtube.com/watch', 'https://youtube.com/watch?v=short',
    `https://youtube.com/watch?v=${id}x`, `https://youtube.com/watch?v=${id}&v=abcdefghijk`,
    'https://youtu.be/ab%2Fdefghijk', 'https://youtu.be/1234567890!',
  ]) assert.equal(parseYouTubeUrl(url), null, url);
});
test('normalizes valid timestamps while discarding tracking parameters', () => {
  assert.equal(parseYouTubeUrl(`https://youtu.be/${id}?t=1h2m3s&si=abc`).startSeconds,3723);
  assert.equal(parseYouTubeUrl(`https://youtube.com/watch?v=${id}&t=83`).startSeconds,83);
  assert.equal(parseYouTubeUrl(`https://youtube.com/embed/${id}?start=21`).startSeconds,21);
  assert.equal(parseYouTubeUrl(`https://youtu.be/${id}#t=35s`).startSeconds,35);
  assert.equal(youtubeAt(id, 1234),`https://www.youtube.com/watch?v=${id}&t=1s`);
});
test('rejects invalid and excessive timestamps rather than guessing', () => {
  for (const value of ['-3','Infinity','3.7','a','999999999999999999']) {
    assert.equal(parseYouTubeUrl(`https://youtu.be/${id}?t=${value}`),null);
  }
  assert.throws(()=>youtubeAt('invalid',100));
  assert.throws(()=>youtubeAt(id,-1));
});

const srt = '1\r\n00:00:01,250 --> 00:00:03,500\r\nس: ما الاسترجاع؟\r\n\r\n2\r\n00:00:04,000 --> 00:00:07,250\r\nج: استدعاء المعلومة.\r\n';
test('parses SRT milliseconds, original text, cue labels and line provenance', () => {
  const segments = parseTranscript(srt,'srt','درس.srt');
  assert.equal(segments.length,2);
  assert.equal(segments[0].startMs,1250);
  assert.equal(segments[0].endMs,3500);
  assert.equal(segments[0].sourceLabel,'درس.srt');
  assert.equal(segments[0].sourceLine,1);
  assert.equal(segments[0].cueId,'1');
  assert.equal(segments[1].sourceLine,5);
  assert.equal(segments[0].text,'س: ما الاسترجاع؟');
  assert.equal(segments[0].raw,'1\n00:00:01,250 --> 00:00:03,500\nس: ما الاسترجاع؟');
});
test('parses VTT identifiers, settings, BOM, short timestamps and markup without exposing markup as questions', () => {
  const text='\uFEFFWEBVTT\nKind: captions\n\nNOTE metadata\nnot spoken\n\ncue-one\n00:01.000 --> 00:03.000 align:start position:0%\n<v Teacher><b>س: ما العلم؟</b></v>\n\n00:04.000 --> 00:07.000\nج: معرفة &amp; فهم\n';
  const segments = parseTranscript(text,'vtt','درس.vtt');
  assert.equal(segments.length,2);
  assert.equal(segments[0].cueId,'cue-one');
  assert.equal(segments[0].startMs,1000);
  assert.equal(segments[0].text,'س: ما العلم؟');
  assert.ok(segments[0].raw.includes('<v Teacher>'));
  assert.equal(segments[1].text,'ج: معرفة & فهم');
});
test('malformed or missing timings fail instead of silently dropping transcript evidence', () => {
  for(const text of ['1\n00:00:02,000 --> 00:00:01,000\nنص','1\n00:99:00,000 --> 01:00:00,000\nنص','1\n00:00:01,000 --> broken\nنص','هذا ليس SRT']) {
    assert.throws(()=>parseTranscript(text,'srt','x.srt'));
  }
  assert.throws(()=>parseTranscript('WEBVTT\n\n','vtt','x.vtt'));
});
test('preserves original cue order and overlaps without manufacturing chronology', () => {
  const segments=parseTranscript('1\n00:00:03,000 --> 00:00:05,000\nالأول\n\n2\n00:00:02,000 --> 00:00:04,000\nالثاني','srt','x.srt');
  assert.deepEqual(segments.map(s=>s.startMs),[3000,2000]);
  assert.notEqual(segments[0].id,segments[1].id);
});
test('plain pasted transcript has no fabricated video timestamps', () => {
  const segments = parseTranscript('فقرة أولى\nسطر ثان\n\nفقرة ثانية','text','نص ملصق');
  assert.equal(segments.length,2);
  assert.equal(segments[0].startMs,null);
  assert.equal(segments[0].endMs,null);
  assert.equal(segments[0].text,'فقرة أولى\nسطر ثان');
  assert.equal(segments[1].sourceLine,4);
});
test('extracts only explicit written Q/A across cues with both source references', () => {
  const source=prepareYouTubeSource(`https://youtu.be/${id}`,srt,'srt','درس الاسترجاع');
  assert.equal(source.method,'written-qa');
  assert.equal(source.questions.length,1);
  assert.equal(source.questions[0].question,'ما الاسترجاع؟');
  assert.equal(source.questions[0].answer,'استدعاء المعلومة.');
  assert.deepEqual(source.questions[0].segmentIds,source.segments.map(s=>s.id));
  assert.equal(source.questions[0].startMs,1250);
  assert.equal(source.questions[0].endMs,7250);
  assert.equal(source.questions[0].url,`https://www.youtube.com/watch?v=${id}&t=1s`);
  assert.ok(source.body.includes('00:00:01,250 --> 00:00:03,500'));
  assert.ok(source.body.includes('https://www.youtube.com/watch?v='+id));
});
test('ordinary narration never becomes an invented question or answer', () => {
  const source=prepareYouTubeSource(`https://youtube.com/watch?v=${id}`,'التعلم مفيد. كيف نتعلم؟ قد تختلف الطرق.','text');
  assert.deepEqual(source.questions,[]);
  assert.equal(source.segments[0].url,`https://www.youtube.com/watch?v=${id}`);
});
test('ignores incomplete pairs and captures Arabic or English explicit markers', () => {
  const source=prepareYouTubeSource(`https://youtu.be/${id}`,'س: غير مكتمل\nQ: What?\nA: Knowledge.\nج: بلا سؤال\nس: لماذا؟','text');
  assert.equal(source.questions.length,1);
  assert.equal(source.questions[0].question,'What?');
  assert.equal(source.questions[0].answer,'Knowledge.');
  assert.equal(source.questions[0].startMs,null);
});
test('rejects empty, corrupted, excessive or unsupported transcript input', () => {
  for(const text of ['', '  ','a\u0000b','a\uFFFDb','ع'.repeat(600000)]) assert.throws(()=>parseTranscript(text,'text','x'));
  assert.throws(()=>parseTranscript('hello','pdf','x'));
  assert.throws(()=>prepareYouTubeSource('https://evil.example/x','text','text'));
});

test('saved VTT note exposes only validated visible questions to the card parser', () => {
  const raw = 'WEBVTT\n\nNOTE hidden metadata\nس: سؤال من البيانات الوصفية\nج: جواب لا ينبغي حفظه\n\ncue-1\n00:01.000 --> 00:03.000\n<v Teacher><b>س: ما العلم؟</b></v>\n\ncue-2\n00:04.000 --> 00:07.000\n<v Teacher>ج: معرفة &amp; فهم</v>\n';
  const source = prepareYouTubeSource(`https://youtu.be/${id}`,raw,'vtt');
  assert.deepEqual(source.questions.map(({question,answer})=>({question,answer})),[{question:'ما العلم؟',answer:'معرفة & فهم'}]);
  assert.deepEqual(parseQuestionAnswer(source.body),source.questions.map(({question,answer})=>({question,answer})));
  assert.ok(source.body.includes(`مرجع السؤال: https://www.youtube.com/watch?v=${id}&t=1s`));
});
test('quoted original transcript remains exactly recoverable without duplicate card extraction', () => {
  const raw = '\uFEFF1\r\n00:00:01,000 --> 00:00:03,000\r\nس: مكتوب؟\r\nج: نعم\r\n\r\n';
  const source = prepareYouTubeSource(`https://youtu.be/${id}`,raw,'srt');
  assert.equal(source.originalText,raw);
  const quoted = source.body.split('التفريغ الأصلي — اقتباس للمراجعة:\n')[1];
  assert.equal(quoted.split('\n').map(line=>line.slice(2)).join('\n'),raw);
  assert.deepEqual(parseQuestionAnswer(source.body),[{question:'مكتوب؟',answer:'نعم'}]);
});
test('out-of-order question and answer cues use a valid time envelope while retaining evidence order', () => {
  const raw = '1\n00:00:10,000 --> 00:00:12,000\nس: لماذا؟\n\n2\n00:00:01,000 --> 00:00:02,000\nج: السبب';
  const source = prepareYouTubeSource(`https://youtu.be/${id}`,raw,'srt');
  const question = source.questions[0];
  assert.equal(question.startMs,1000);
  assert.equal(question.endMs,12000);
  assert.equal(question.url,`https://www.youtube.com/watch?v=${id}&t=10s`);
  assert.deepEqual(source.segments.map(segment=>segment.startMs),[10000,1000]);
  assert.deepEqual(question.segmentIds,source.segments.map(segment=>segment.id));
});
