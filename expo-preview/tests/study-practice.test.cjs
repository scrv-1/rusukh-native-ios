const test = require('node:test');
const assert = require('node:assert/strict');
const { makePracticeSession, parseQuestionAnswer, wikiLinkTitleError, wikiLinks, graphEdges } = require('../.test-build/core.js');

const card = (id, question = `سؤال ${id}`, answer = `جواب ${id}`) => ({
  id, noteId: 'n1', question, answer, dueAt: 0, intervalDays: 0, ease: 2.5, repetitions: 0, updatedAt: 0,
});

test('S002: recall practice accepts one card and never invents distractors or marks synonyms wrong', () => {
  const input = Object.freeze([Object.freeze(card('c1', 'اذكر عددًا أوليًا', '2'))]);
  assert.deepEqual(makePracticeSession(input, 8, () => 0), [{ cardId: 'c1', noteId: 'n1', question: 'اذكر عددًا أوليًا', answer: '2' }]);
  const session = makePracticeSession([...input, card('c2', 'ما أصغر عدد أولي فردي؟', '3')], 8, () => 0);
  assert.equal(session.length, 2);
  assert.ok(session.every(item => !('options' in item)));
});

test('S002: practice samples unique valid prompts without changing cards and stays bounded', () => {
  const input = [card('c1'), card('c1', 'تكرار الهوية'), card('c2', '  سؤال C1  ', 'جواب c1'),
    card('c3', 'سؤال مختلف', 'جواب c1'), card('empty', ' ', 'جواب'), card('empty-a', 'سؤال', '\n'),
    ...Array.from({ length: 20 }, (_, i) => card(`extra-${i}`))];
  const before = JSON.stringify(input);
  const session = makePracticeSession(input, 1000, () => 0.99);
  assert.equal(session.length, 8);
  assert.equal(new Set(session.map(item => item.cardId)).size, 8);
  assert.ok(session.some(item => item.cardId === 'c3'));
  assert.ok(!session.some(item => ['c2', 'empty', 'empty-a'].includes(item.cardId)));
  assert.equal(JSON.stringify(input), before);
  for (const limit of [0, -1, NaN, Infinity]) assert.deepEqual(makePracticeSession(input, limit), []);
  assert.equal(makePracticeSession(input, 2.9, () => 0).length, 2);
});

test('S004: multiline Arabic/English answers retain lists, paragraph breaks, and multiline questions', () => {
  const body = 'س: اذكر الخطوات\nبالترتيب؟\nج: الخطوة الأولى\n- الخطوة الثانية\n\nثم التحقق.\n\nQ: Why?\nA:\nFirst reason.\nSecond reason.';
  assert.deepEqual(parseQuestionAnswer(body), [
    { question: 'اذكر الخطوات\nبالترتيب؟', answer: 'الخطوة الأولى\n- الخطوة الثانية\n\nثم التحقق.' },
    { question: 'Why?', answer: 'First reason.\nSecond reason.' },
  ]);
});

test('S004: generated provenance and quoted transcript never become answer text or extra cards', () => {
  const body = 'المصدر: درس\nس: سؤال أول؟\nج: جواب\nتكملة\nالشاهد: «دليل»\nتفصيل الشاهد\n\nس: سؤال ثان؟\nج: آخر\nمرجع السؤال: https://example.org\nمقاطع المصدر: segment-1\n\nالتفريغ الأصلي — اقتباس للمراجعة:\n> س: سؤال داخل اقتباس\n> ج: جواب مقتبس\n\nالنص الذي استُخدم:\n> Q: Quoted?\n> A: No';
  assert.deepEqual(parseQuestionAnswer(body), [{ question: 'سؤال أول؟', answer: 'جواب\nتكملة' }, { question: 'سؤال ثان؟', answer: 'آخر' }]);
});

test('S004: fenced source blocks, quote boundaries and headings isolate Q/A extraction', () => {
  const body = 'س: حقيقي؟\nج: نعم\n> اقتباس خارج الإجابة\n```text\nس: داخل الشيفرة؟\nج: مستبعد\n```\nQ: Next?\nA: Yes\n---\nنثر خارج الإجابة\n~~~\nQ: Fenced?\nA: No\n~~~\nس: أخير؟\nج: صحيح\n## المراجع\nتفصيل';
  assert.deepEqual(parseQuestionAnswer(body), [{ question: 'حقيقي؟', answer: 'نعم' }, { question: 'Next?', answer: 'Yes' }, { question: 'أخير؟', answer: 'صحيح' }]);
});

test('S004: incomplete pairs, orphan answer labels, CRLF and empty answer bodies are handled explicitly', () => {
  assert.deepEqual(parseQuestionAnswer('س: غير مكتمل\r\nQ: What?\r\nA: Knowledge.\r\nج: بلا سؤال\r\nس: سؤال فارغ\r\nج:\r\nس: آخر؟\r\nج: نعم'),
    [{ question: 'What?', answer: 'Knowledge.' }, { question: 'آخر؟', answer: 'نعم' }]);
});

test('S005: title validation rejects ambiguous wiki delimiters and preserves valid legacy targets', () => {
  for (const title of ['الجزء | الأول', 'الجزء ] الأول', 'أول\nثان', 'أول\rثان']) assert.equal(typeof wikiLinkTitleError(title), 'string');
  for (const title of ['عنوان عربي', 'C++ [مقدمة', 'مصدر: درس', 'A\\B']) {
    assert.equal(wikiLinkTitleError(title), null);
    assert.deepEqual(wikiLinks(`[[${title}]]`), [title]);
    assert.deepEqual(graphEdges([{id:'a', title:'المصدر', body:`[[${title}]]`}, {id:'b',title,body:''}]), [{from:'a',to:'b'}]);
  }
});
