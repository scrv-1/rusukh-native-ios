const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeTitle, wikiLinks, replaceWikiLinks, graphEdges, parseQuestionAnswer, scheduleReview,
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
test('wiki links retain first spelling and encounter order across normalized aliases', () => {
  assert.deepEqual(wikiLinks('[[ Study   Notes |أول]] [[study notes]] [[علم  الأحياء]] [[علم الأحياء|ثان]] [[آخر]]'),
    ['Study   Notes', 'علم  الأحياء', 'آخر']);
});
test('a large single note retains every unique link and ignores later aliases', () => {
  const names=Array.from({length:6000},(_,i)=>`موضوع ${i}`);
  const body=names.map(name=>`[[${name}]]`).join(' ')+names.slice(0,20).map(name=>` [[ ${name} |اسم بديل]]`).join('');
  assert.deepEqual(wikiLinks(body),names);
});
test('wiki scanner preserves nested open brackets, empty aliases, CR and malformed prefixes', () => {
  const cases = [
    '[[outer[[inner]] [[|alias[[good]]',
    '[[عربي\rعنوان|اسم|آخر]] [[ ]] [[هدف|]] [[هدف]]',
    '[[]] [[[|]] [[a]b]] [[a\nb]] [[a|b\nc]] [[last]]',
    '[[a|[[nested]]]] [[b]] ] [[c]]',
  ];
  for (const body of cases) {
    const expected=[]; const actual=[];
    const rewrite=(list)=>(full,target,alias)=>{list.push({full,target,alias});return `{${target}${alias ?? ''}}`;};
    const old=body.replace(/\[\[([^\]|\n]+)(\|[^\]\n]*)?\]\]/g,rewrite(expected));
    assert.equal(replaceWikiLinks(body,rewrite(actual)),old);
    assert.deepEqual(actual,expected);
    assert.equal(replaceWikiLinks(body,full=>full),body);
  }
});
test('wiki scanner matches legacy syntax on every short bracket/pipe/newline combination', () => {
  const alphabet=['[',']','|','\n','a'];
  const visit=(body,depth)=>{
    const expected=[]; const actual=[];
    const old=body.replace(/\[\[([^\]|\n]+)(\|[^\]\n]*)?\]\]/g,(full,target,alias)=>{
      expected.push([full,target,alias]);return `{${target}${alias ?? ''}}`;
    });
    const result=replaceWikiLinks(body,(full,target,alias)=>{
      actual.push([full,target,alias]);return `{${target}${alias ?? ''}}`;
    });
    assert.equal(result,old,JSON.stringify(body));
    assert.deepEqual(actual,expected,JSON.stringify(body));
    if(depth<7) for(const character of alphabet)visit(body+character,depth+1);
  };
  visit('',0);
});
test('wiki scanner completes million-character malformed notes within a worker watchdog', async () => {
  const { Worker }=require('node:worker_threads');
  const worker=new Worker(`
    const {parentPort,workerData}=require('node:worker_threads');
    const {wikiLinks,replaceWikiLinks}=require(workerData);
    const plain='['.repeat(1000000);
    const alias='[[x|'.repeat(250000);
    const values=[plain,alias].map(body=>({links:wikiLinks(body),unchanged:replaceWikiLinks(body,()=>{throw Error('unexpected match');})===body}));
    parentPort.postMessage(values);
  `,{eval:true,workerData:require.resolve('../.test-build/core.js')});
  try {
    const result=await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(new Error('malformed wiki input exceeded 10-second watchdog')),10000);
      worker.once('message',data=>{clearTimeout(timer);resolve(data);});
      worker.once('error',error=>{clearTimeout(timer);reject(error);});
    });
    assert.deepEqual(result,[{links:[],unchanged:true},{links:[],unchanged:true}]);
  } finally {await worker.terminate();}
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
test('graph preserves first-seen order and deduplicates aliases across repeated source IDs',()=>{
  const notes=[
    {id:'a',title:'Alpha',body:'[[Beta|اسم]] [[ beta ]] [[Alpha]] [[Unknown]]'},
    {id:'a',title:'Alpha copy',body:'[[Gamma]] [[Beta]] [[Alpha copy]]'},
    {id:'b',title:'Beta',body:'[[Gamma]] [[Gamma|آخر]]'},
    {id:'c',title:'Gamma',body:''},
  ];
  assert.deepEqual(graphEdges(notes),[{from:'a',to:'b'},{from:'a',to:'c'},{from:'b',to:'c'}]);
});
test('graph edge deduplication cannot collide when identifiers contain separators',()=>{
  assert.deepEqual(graphEdges([
    {id:'a\u0000b',title:'Source one',body:'[[Target one]]'},
    {id:'a',title:'Source two',body:'[[Target two]]'},
    {id:'c',title:'Target one',body:''},
    {id:'b\u0000c',title:'Target two',body:''},
  ]),[{from:'a\u0000b',to:'c'},{from:'a',to:'b\u0000c'}]);
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

function assertSuccessfulGradeOrder(card, now, context) {
  const before={...card};
  const hard=scheduleReview(card,'hard',now);
  const good=scheduleReview(card,'good',now);
  const easy=scheduleReview(card,'easy',now);
  assert.ok(hard.dueAt<=good.dueAt,
    `${context}: Hard ${hard.intervalDays}d must not follow Good ${good.intervalDays}d`);
  assert.ok(good.dueAt<=easy.dueAt,
    `${context}: Good ${good.intervalDays}d must not follow Easy ${easy.intervalDays}d`);
  for(const result of [hard,good,easy]) {
    assert.ok(Number.isInteger(result.intervalDays) && result.intervalDays>=1,context);
    assert.equal(result.dueAt,now+result.intervalDays*MS_DAY,context);
    // The backup format caps the stored counter; reviews must stay restorable.
    assert.equal(result.repetitions,Math.min(100000,card.repetitions+1),context);
    assert.equal(validateBackup({...exampleBackup(),cards:[result],reviews:[]}),true,context);
    assert.equal(result.updatedAt,now,context);
    assert.ok(result.ease>=1.3 && result.ease<=3,context);
    for(const field of ['id','noteId','question','answer']) assert.equal(result[field],card[field],context);
  }
  const again=scheduleReview(card,'again',now);
  assert.equal(again.dueAt,now+10*60*1000,context);
  assert.equal(again.intervalDays,0,context);
  assert.equal(again.repetitions,0,context);
  assert.deepEqual(card,before,`${context}: scheduling must not mutate the stored card`);
  return [again,hard,good,easy];
}

test('S003: first Easy does not make the next Hard later than Good',()=>{
  const first=scheduleReview(exampleCard,'easy',1000);
  const now=first.dueAt;
  const [,hard,good,easy]=assertSuccessfulGradeOrder(first,now,'after first Easy');
  assert.equal(first.intervalDays,4);
  assert.equal(hard.intervalDays,5);
  assert.equal(good.intervalDays,5);
  assert.equal(easy.intervalDays,15);
});

test('S003: every generated grading sequence through seven reviews preserves grade order',()=>{
  const grades=['again','hard','good','easy'];
  const queue=[{card:{...exampleCard},path:[]}];
  let checked=0;
  for(let index=0;index<queue.length;index++) {
    const {card,path}=queue[index];
    const next=assertSuccessfulGradeOrder(Object.freeze(card),card.dueAt+1234,path.join('→') || 'new');
    checked++;
    if(path.length<7) next.forEach((card,i)=>queue.push({card,path:[...path,grades[i]]}));
  }
  assert.equal(checked,21845);
});

test('S003: backup-accepted fractional intervals, legacy ease and repetition states preserve order',()=>{
  const intervals=[0,0.01,0.5,1,4,40,1000,365000];
  const eases=[1,1.3,2.5,2.85,3,4,5];
  const repetitions=[0,1,2,5,100000];
  for(const intervalDays of intervals) for(const ease of eases) for(const count of repetitions) {
    const card={...exampleCard,intervalDays,ease,repetitions:count};
    const backup={...exampleBackup(),cards:[card],reviews:[]};
    assert.equal(validateBackup(backup),true);
    assertSuccessfulGradeOrder(Object.freeze(card),1700000000000,
      `restored interval=${intervalDays}, ease=${ease}, repetitions=${count}`);
  }
});

test('S003: first-review targets and a lapse restart retain the simplified policy',()=>{
  const now=1000;
  assert.deepEqual(['hard','good','easy'].map(grade=>scheduleReview(exampleCard,grade,now).intervalDays),[1,1,4]);
  const first=scheduleReview(exampleCard,'good',now);
  const second=scheduleReview(first,'good',first.dueAt);
  const third=scheduleReview(second,'good',second.dueAt);
  assert.deepEqual([first.intervalDays,second.intervalDays,third.intervalDays],[1,3,8]);
  const lapsed=scheduleReview({...exampleCard,intervalDays:60,repetitions:8},'again',now);
  assert.equal(lapsed.dueAt,now+10*60*1000);
  assert.deepEqual(['hard','good','easy'].map(grade=>scheduleReview(lapsed,grade,lapsed.dueAt).intervalDays),[1,1,4]);
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
// Seeded only for reproducible tests; the app uses Math.random for study quizzes.
function quizRandom(seed) {
  return () => {
    let value=seed+=0x6D2B79F5;
    value=Math.imul(value^(value>>>15),value|1);
    value^=value+Math.imul(value^(value>>>7),value|61);
    return ((value^(value>>>14))>>>0)/4294967296;
  };
}
function quizCards(count) {
  return Array.from({length:count},(_,i)=>({...exampleCard,id:`c${i}`,question:`سؤال ${i}`,answer:`جواب ${i}`}));
}
test('quiz can reach every card rather than repeatedly taking the same prefix',()=>{
  const cards=quizCards(20);
  const rounds=Array.from({length:40},(_,i)=>makeQuiz(cards,8,quizRandom(i+1)));
  const seen=new Set(rounds.flatMap(round=>round.map(question=>question.cardId)));
  assert.equal(seen.size,20);
  assert.ok(new Set(rounds.map(round=>round.map(question=>question.cardId).join(','))).size>1);
  for(const round of rounds) assert.equal(new Set(round.map(q=>q.cardId)).size,8);
});
test('quiz selection gives each of three cards the same share of exhaustive shuffle choices',()=>{
  const cards=quizCards(3), counts=new Map(cards.map(card=>[card.id,0]));
  for(let first=0;first<3;first++) for(let second=0;second<2;second++) {
    const draws=[(first+0.5)/3,(second+0.5)/2];
    const [question]=makeQuiz(cards,1,()=>draws.shift()??0.5);
    counts.set(question.cardId,counts.get(question.cardId)+1);
  }
  assert.deepEqual([...counts.values()],[2,2,2]);
});
test('quiz answer positions vary and remain reproducible for a supplied random source',()=>{
  const cards=quizCards(20), positions=new Set();
  for(let seed=1;seed<=40;seed++) {
    const [first]=makeQuiz(cards,8,quizRandom(seed));
    positions.add(first.options.indexOf(first.answer));
  }
  assert.deepEqual([...positions].sort(),[0,1,2,3]);
  assert.deepEqual(makeQuiz(cards,8,quizRandom(42)),makeQuiz(cards,8,quizRandom(42)));
});
test('quiz keeps separate questions sharing an answer and normalizes distractor uniqueness',()=>{
  const cards=[
    {...exampleCard,id:'same-1',question:'الأول؟',answer:' Answer '},
    {...exampleCard,id:'same-2',question:'الثاني؟',answer:'answer'},
    {...exampleCard,id:'other',question:'الثالث؟',answer:'Other'},
  ];
  const quiz=makeQuiz(cards,10,quizRandom(23));
  assert.equal(quiz.length,3);
  assert.deepEqual(new Set(quiz.map(q=>q.cardId)),new Set(cards.map(card=>card.id)));
  for(const q of quiz) {
    const original=cards.find(card=>card.id===q.cardId);
    assert.equal(q.question,original.question);
    assert.equal(q.answer,original.answer);
    assert.equal(q.options.filter(option=>option===q.answer).length,1);
    assert.equal(new Set(q.options.map(normalizeTitle)).size,q.options.length);
  }
});
test('quiz does not reorder or edit source cards and handles small or invalid limits',()=>{
  const cards=Object.freeze(quizCards(3).map(card=>Object.freeze(card)));
  const before=JSON.stringify(cards);
  assert.equal(makeQuiz(cards,2.9,quizRandom(2)).length,2);
  for(const limit of [0,-1,NaN,Infinity,-Infinity]) assert.deepEqual(makeQuiz(cards,limit,quizRandom(2)),[]);
  assert.deepEqual(makeQuiz([],8,quizRandom(2)),[]);
  assert.equal(JSON.stringify(cards),before);
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

