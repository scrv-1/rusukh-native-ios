const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../../../..');
const { parseQuestionAnswer, scheduleReview, makeQuiz, graphEdges, wikiLinks } = require(path.join(root, '.test-build/core.js'));
const card = {id:'c1',noteId:'n1',question:'اذكر عددًا أوليًا',answer:'2',dueAt:0,intervalDays:0,ease:2.5,repetitions:0,updatedAt:1};

// These are evidence tests: assertions deliberately document current behavior,
// not desired acceptance criteria. A future fix should make them fail/change.
test('S002: an automatically built open-question MCQ contains two mathematically valid choices', () => {
  const source = [card,{...card,id:'c2',noteId:'n2',question:'ما أصغر عدد أولي فردي؟',answer:'3'}];
  const item = makeQuiz(source,8,()=>0.25).find(q=>q.cardId==='c1');
  assert.deepEqual([...item.options].sort(), ['2','3']);
  assert.equal(item.answer,'2');
  assert.notEqual('3', item.answer); // App's answer equality marks 3 incorrect.
  console.log(JSON.stringify({case:'S002',question:item.question,options:item.options,accepted:item.answer,alsoValid:'3'}));
});

test('S003: after first Easy, Hard waits longer than Good for the same card state', () => {
  const afterEasy = scheduleReview(card,'easy',1000);
  const hard = scheduleReview(afterEasy,'hard',afterEasy.dueAt);
  const good = scheduleReview(afterEasy,'good',afterEasy.dueAt);
  assert.equal(afterEasy.intervalDays,4);
  assert.equal(hard.intervalDays,5);
  assert.equal(good.intervalDays,3);
  assert.ok(hard.dueAt > good.dueAt);
  console.log(JSON.stringify({case:'S003',prior:afterEasy.intervalDays,hard:hard.intervalDays,good:good.intervalDays}));
});

test('S004: answer continuation lines are silently omitted by extraction', () => {
  const body = 'س: ما الشرطان معًا؟\nج: الشرط الأول.\nوالشرط الثاني أيضًا.';
  const actual = parseQuestionAnswer(body);
  assert.deepEqual(actual,[{question:'ما الشرطان معًا؟',answer:'الشرط الأول.'}]);
  assert.ok(!actual[0].answer.includes('الثاني'));
  console.log(JSON.stringify({case:'S004',body,actual}));
});

test('S005: a title accepted by the editor cannot be represented as its documented wikilink', () => {
  const notes = [
    {id:'source',title:'مصدر',body:'راجع [[الجزء | الأول]]'},
    {id:'target',title:'الجزء | الأول',body:''},
  ];
  assert.deepEqual(wikiLinks(notes[0].body),['الجزء']);
  assert.deepEqual(graphEdges(notes),[]);
  console.log(JSON.stringify({case:'S005',title:notes[1].title,parsed:wikiLinks(notes[0].body),edges:graphEdges(notes)}));
});

test('positive control: ordinary link and a one-line Q/A still work', () => {
  assert.deepEqual(graphEdges([{id:'a',title:'أ',body:'[[ب]]'},{id:'b',title:'ب',body:''}]),[{from:'a',to:'b'}]);
  assert.deepEqual(parseQuestionAnswer('س: ما الاسم؟\nج: رسوخ'),[{question:'ما الاسم؟',answer:'رسوخ'}]);
});

