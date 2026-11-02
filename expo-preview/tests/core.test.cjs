const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeTitle, wikiLinks, graphEdges, parseQuestionAnswer, scheduleReview,
  dueCards, makeQuiz, validateBackup, makeId, MS_DAY,
  MAX_BACKUP_BYTES, utf8ByteLength, serializeBackup
} = require('../.test-build/core.js');

const exampleCard = {
  id: 'c1', noteId: 'n1', question: 'ما هذا؟', answer: 'اختبار', dueAt: 100,
  intervalDays: 0, ease: 2.5, repetitions: 0, updatedAt: 100,
};
function exampleBackup(){ return {
  format:'rusukh-backup', version:1, exportedAt:'2026-10-31',
  notes:[{id:'n1',title:'عنوان',body:'محتوى',createdAt:100,updatedAt:200}],
  cards:[{...exampleCard}], reviews:[{id:'r1',cardId:'c1',grade:'good',reviewedAt:300}]
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
test('backup notes must remain editable and recoverable by the note editor',()=>{
  for (const changes of [{id:''},{id:'n'.repeat(201)},{title:''},{title:'   '},{title:'ع'.repeat(161)}]) {
    const b=exampleBackup();
    b.notes[0]={...b.notes[0],...changes};
    b.cards[0].noteId=b.notes[0].id;
    assert.equal(validateBackup(b),false,`incompatible restored note: ${JSON.stringify(changes)}`);
  }
  const b=exampleBackup();
  b.notes[0].id='n'.repeat(200);b.cards[0].noteId=b.notes[0].id;
  b.notes[0].title='ع'.repeat(160);
  assert.equal(validateBackup(b),true);
});
test('backup card and review identifiers follow the same nonempty bounded contract',()=>{
  for(const collection of ['cards','reviews']) {
    for(const id of ['', 'x'.repeat(201)]) {
      const b=exampleBackup();b[collection][0].id=id;
      if(collection==='cards') b.reviews[0].cardId=id;
      assert.equal(validateBackup(b),false);
    }
  }
});
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

test('backup rejects ambiguous normalized note titles without rejecting distinct legacy titles',()=>{
  for (const title of ['عنوان', '  عنوان  ']) {
    const b=exampleBackup(); b.notes.push({...b.notes[0],id:'n2',title});
    assert.equal(validateBackup(b),false);
  }
  const b=exampleBackup(); b.notes[0].title='Study  Notes';
  b.notes.push({...b.notes[0],id:'n2',title:' study notes '});
  assert.equal(validateBackup(b),false);
  b.notes[1].title='درس آخر';
  assert.equal(validateBackup(b),true);
});

test('UTF-8 byte count matches canonical encoding for Arabic, emoji and unmatched surrogates',()=>{
  for (const text of ['', 'ascii', 'رُسوخ', 'علم 📚', '漢字', '\ud800', 'a\udc00z']) {
    assert.equal(utf8ByteLength(text),Buffer.byteLength(text,'utf8'));
  }
});

test('serialized backup preserves version-one data and remains importable',()=>{
  const b=exampleBackup();
  const text=serializeBackup(b);
  assert.deepEqual(JSON.parse(text),b);
  assert.equal(validateBackup(JSON.parse(text)),true);
  assert.equal(text,JSON.stringify(b,null,2));
});

test('serializer refuses invalid content before producing an export',()=>{
  const b=exampleBackup(); b.cards[0].answer='a'.repeat(1000001);
  assert.throws(()=>serializeBackup(b),/غير صالح/);
});

// Use Node's independent UTF-8 implementation to construct the exact wire-size boundary.
function arabicBackupAtBytes(bytes) {
  const b={...exampleBackup(),notes:Array.from({length:16},(_,i)=>({
    id:`n${i}`,title:`درس ${i}`,body:'',createdAt:1,updatedAt:1
  })),cards:[],reviews:[]};
  let remaining=bytes-Buffer.byteLength(JSON.stringify(b,null,2),'utf8');
  for (const note of b.notes) {
    const count=Math.min(1000000,Math.floor(remaining/2));
    note.body='ع'.repeat(count); remaining-=count*2;
    if (remaining===1 && note.body.length<1000000) { note.body+='x';remaining=0; }
  }
  assert.equal(remaining,0);
  assert.equal(Buffer.byteLength(JSON.stringify(b,null,2),'utf8'),bytes);
  return b;
}

test('Arabic backup exactly at 15 MiB can be exported and reimported',()=>{
  assert.equal(MAX_BACKUP_BYTES,15*1024*1024);
  const b=arabicBackupAtBytes(15*1024*1024);
  const text=serializeBackup(b);
  assert.equal(Buffer.byteLength(text,'utf8'),MAX_BACKUP_BYTES);
  assert.equal(validateBackup(JSON.parse(text)),true);
});

test('Arabic backup one byte over 15 MiB is refused before writing a file',()=>{
  const b=arabicBackupAtBytes(15*1024*1024+1);
  assert.equal(validateBackup(b),true);
  assert.throws(()=>serializeBackup(b),/15/);
});

test('text source size limit counts Arabic UTF-8 bytes even without file metadata',()=>{
  const { prepareSource, MAX_SOURCE_BYTES }=require('../.test-build/sources.js');
  const boundary='ع'.repeat(MAX_SOURCE_BYTES/2);
  assert.equal(Buffer.byteLength(boundary,'utf8'),MAX_SOURCE_BYTES);
  assert.ok(prepareSource('محاضرة.txt',boundary).body.endsWith(boundary));
  assert.throws(()=>prepareSource('محاضرة.txt',boundary+'x'),/أكبر/);
  const previouslyAccepted='ع'.repeat(600000);
  assert.ok(previouslyAccepted.length<MAX_SOURCE_BYTES);
  assert.ok(Buffer.byteLength(previouslyAccepted,'utf8')>MAX_SOURCE_BYTES);
  assert.throws(()=>prepareSource('محاضرة.txt',previouslyAccepted),/أكبر/);
});

test('text source byte limit includes emoji and the UTF-8 BOM before normalization',()=>{
  const { prepareSource, MAX_SOURCE_BYTES }=require('../.test-build/sources.js');
  const emoji='📚'.repeat(MAX_SOURCE_BYTES/4);
  assert.equal(Buffer.byteLength(emoji,'utf8'),MAX_SOURCE_BYTES);
  assert.ok(prepareSource('كتب.txt',emoji).body.endsWith(emoji));
  assert.throws(()=>prepareSource('كتب.txt',emoji+'x'),/أكبر/);
  assert.throws(()=>prepareSource('كتب.txt','\uFEFF'+emoji),/أكبر/);
});
