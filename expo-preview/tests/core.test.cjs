const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeTitle, wikiLinks, graphEdges, parseQuestionAnswer, scheduleReview,
  dueCards, makeQuiz, validateBackup, makeId, MS_DAY
} = require('../.test-build/core.js');

const exampleCard = {
  id: 'c1', noteId: 'n1', question: 'ما هذا؟', answer: 'اختبار', dueAt: 100,
  intervalDays: 0, ease: 2.5, repetitions: 0, updatedAt: 100,
};
function exampleBackup(){ return {
  format:'rusukh-backup', version:1, exportedAt:'2026-10-31',
  notes:[{id:'n1',title:'عنوان',body:'محتوى',createdAt:100,updatedAt:200}],
  cards:[exampleCard], reviews:[{id:'r1',cardId:'c1',grade:'good',reviewedAt:300}]
}; }

test('Arabic title normalisation ignores extra whitespace/case', () => {
  assert.equal(normalizeTitle('  تعلم   نشط  '), 'تعلم نشط');
  assert.equal(normalizeTitle('  SCIENCE '),'science');
});
test('wiki link parser supports alias and deduplicates', () => {
  assert.deepEqual(wikiLinks('[[المراجعة المتباعدة|افتح]]، [[المراجعة المتباعدة]] و [[التعلم]]'),
   ['المراجعة المتباعدة','التعلم']);
});
test('wiki parser ignores incomplete links and empty targets', () => {
  assert.deepEqual(wikiLinks('[[ ]] [[مفقود] [عنوان]'), []);
});
test('graph builds directed links between known note titles only', () => {
  const notes=[
    {id:'a',title:'Alpha',body:'[[beta]] [[unknown]] [[beta]]'},
    {id:'b',title:'Beta',body:'[[Alpha]]'},
    {id:'c',title:'Gamma',body:''},
  ];
  assert.deepEqual(graphEdges(notes),[{from:'a',to:'b'},{from:'b',to:'a'}]);
});
test('graph does not create self-links', () => {
  assert.deepEqual(graphEdges([{id:'a',title:'Alpha',body:'[[Alpha]]'}]),[]);
});
test('extract Arabic Q/A pairs and ignores incomplete', () => {
  assert.deepEqual(parseQuestionAnswer('س: ما العلم؟\nج: معرفة\nس: متى؟\nج: الآن\nس: غير مكتمل'),[
    {question:'ما العلم؟',answer:'معرفة'}, {question:'متى؟',answer:'الآن'}
  ]);
});
test('extract English Q/A pairs', () => {
  assert.deepEqual(parseQuestionAnswer('Q: Two?\nA: 2'),[{question:'Two?',answer:'2'}]);
});
test('repeat grade schedules after 10 minutes', () => {
  const result=scheduleReview({...exampleCard,repetitions:3,intervalDays:6},'again',1000);
  assert.equal(result.dueAt,1000+10*60*1000);
  assert.equal(result.repetitions,0);
  assert.equal(result.intervalDays,0);
});
test('good grade intervals progress 1,3 then more', () => {
  const one=scheduleReview(exampleCard,'good',1000);
  const two=scheduleReview(one,'good',one.dueAt);
  const three=scheduleReview(two,'good',two.dueAt);
  assert.equal(one.intervalDays,1);
  assert.equal(two.intervalDays,3);
  assert.ok(three.intervalDays>3);
});
test('easy first review is four days',()=>{
  const res=scheduleReview(exampleCard,'easy',1000);
  assert.equal(res.intervalDays,4);
  assert.equal(res.dueAt,1000+4*MS_DAY);
});
test('hard grade still schedules >= day',()=>{
  assert.ok(scheduleReview(exampleCard,'hard',100).intervalDays>=1);
});
test('ease always bounded for repeated failures',()=>{
  let result={...exampleCard};
  for(let i=0;i<100;i++)result=scheduleReview(result,'again',i*10000);
  assert.equal(result.ease,1.3);
});
test('dueCards include only due, ascending',()=>{
  assert.deepEqual(dueCards([
    {...exampleCard,id:'future',dueAt:300},
    {...exampleCard,id:'early',dueAt:50},
    {...exampleCard,id:'now',dueAt:100}],100).map(c=>c.id),['early','now']);
});
test('quiz requires two distinct answers',()=>{
  assert.equal(makeQuiz([exampleCard]).length,0);
  assert.equal(makeQuiz([exampleCard,{...exampleCard,id:'c2'}]).length,0);
});
test('quiz options have one correct and no duplicates',()=>{
  const cards=Array.from({length:5},(_,i)=>({...exampleCard,id:`c${i}`,question:`Q${i}`,answer:`A${i}`}));
  const q=makeQuiz(cards,4);
  assert.equal(q.length,4);
  for(const item of q){assert.equal(item.options.filter(x=>x===item.answer).length,1);assert.equal(new Set(item.options).size,item.options.length);}
});
test('valid backup passes',()=>assert.equal(validateBackup(exampleBackup()),true));
test('malformed backup fails',()=>{
  assert.equal(validateBackup(null),false);
  assert.equal(validateBackup({}),false);
  const b=exampleBackup();b.format='other';assert.equal(validateBackup(b),false);
});
test('backup rejects cards referencing nonexistent notes',()=>{
  const b=exampleBackup();b.cards[0].noteId='fake';assert.equal(validateBackup(b),false);
});
test('backup rejects duplicate identifiers',()=>{
  const b=exampleBackup();b.notes.push({...b.notes[0]});assert.equal(validateBackup(b),false);
});
test('backup rejects invalid grades and time values',()=>{
  const b=exampleBackup();b.reviews[0].grade='random';assert.equal(validateBackup(b),false);
  const a=exampleBackup();a.cards[0].dueAt=NaN;assert.equal(validateBackup(a),false);
});
test('new IDs have supplied prefix and differ',()=>{
  const a=makeId('note',100); const b=makeId('note',100);
  assert.ok(a.startsWith('note-'));assert.notEqual(a,b);
});
