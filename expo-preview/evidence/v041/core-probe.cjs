#!/usr/bin/env node
// Run after `tsc -p tsconfig.test.json`; synthetic data only, no iPhone claim.
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {performance}=require('node:perf_hooks');
const project=path.resolve(__dirname,'../..');
const phase=process.argv[2];
if(!['before','after'].includes(phase)) throw new Error('Use before or after');
const core=require(path.join(project,'.test-build/core.js'));
const sha=file=>crypto.createHash('sha256').update(fs.readFileSync(path.join(project,file))).digest('hex');
function rng(seed) {
  return ()=>{
    let value=seed+=0x6D2B79F5;
    value=Math.imul(value^(value>>>15),value|1);
    value^=value+Math.imul(value^(value>>>7),value|61);
    return ((value^(value>>>14))>>>0)/4294967296;
  };
}
const cards=Array.from({length:20},(_,i)=>({id:`c${i}`,noteId:'note',question:`سؤال ${i}`,answer:`جواب ${i}`,
  dueAt:0,intervalDays:0,ease:2.5,repetitions:0,updatedAt:0}));
const rounds=Array.from({length:10},(_,i)=>core.makeQuiz(cards,8,rng(i+1)));
const report={
  phase,observedAt:new Date().toISOString(),
  environment:{node:process.version,platform:process.platform,architecture:process.arch},
  limits:'Actual compiled functions on Node/Linux with synthetic input; not iPhone UI latency, memory, battery or heat. Fixed-seed coverage is a regression example, not a statistical fairness proof.',
  sourceSha256:sha('src/core.ts'),compiledSha256:sha('.test-build/core.js'),
  quiz:{inputCards:20,rounds:10,selectedCardIds:rounds.map(round=>round.map(q=>q.cardId)),
    uniqueCardIds:[...new Set(rounds.flatMap(round=>round.map(q=>q.cardId)))],
    allRoundsIdentical:rounds.every(round=>JSON.stringify(round)===JSON.stringify(rounds[0])),
    firstAnswerPositions:rounds.map(round=>round[0].options.indexOf(round[0].answer))},
  parser:[],
};
for(const count of [1000,3000,6000]) {
  const names=Array.from({length:count},(_,i)=>`موضوع ${i}`);
  const input=names.map(name=>`[[${name}]]`).join(' '),milliseconds=[];
  for(let sample=0;sample<3;sample++) {
    const start=performance.now(),output=core.wikiLinks(input);
    milliseconds.push(+(performance.now()-start).toFixed(3));
    if(JSON.stringify(output)!==JSON.stringify(names)) throw new Error('Link result changed');
  }
  const row={links:count,characters:input.length,milliseconds,
    medianMs:[...milliseconds].sort((a,b)=>a-b)[1]};
  report.parser.push(row);
  process.stdout.write(JSON.stringify(row)+'\n');
}
fs.writeFileSync(path.join(__dirname,`core-probe-${phase}.json`),JSON.stringify(report,null,2)+'\n');
process.stdout.write(JSON.stringify(report.quiz)+'\n');
