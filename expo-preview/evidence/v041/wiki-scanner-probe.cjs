#!/usr/bin/env node
// Bounded legacy-regex reproduction and the actual compiled replacement.
// Legacy is deliberately capped at 40k chars; never run its million-char case.
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {performance}=require('node:perf_hooks');
const project=path.resolve(__dirname,'../..');
const {wikiLinks,replaceWikiLinks,normalizeTitle}=require(path.join(project,'.test-build/core.js'));
const sha=file=>crypto.createHash('sha256').update(fs.readFileSync(path.join(project,file))).digest('hex');
function legacyRead(body) {
  const regex=/\[\[([^\]|\n]+)(?:\|[^\]\n]*)?\]\]/g,found=[],seen=new Set();
  let match;
  while((match=regex.exec(body))) {
    const name=match[1].trim(),key=normalizeTitle(name);
    if(name && !seen.has(key)){seen.add(key);found.push(name);}
  }
  return found;
}
const retarget=(full,target,alias)=>normalizeTitle(target)==='قديم'?`[[جديد${alias ?? ''}]]`:full;
const legacyRewrite=body=>body.replace(/\[\[([^\]|\n]+)(\|[^\]\n]*)?\]\]/g,retarget);
const rewrite=body=>replaceWikiLinks(body,retarget);
function measure(fn,input,expected) {
  const milliseconds=[];
  for(let sample=0;sample<3;sample++) {
    const start=performance.now(),value=fn(input);
    milliseconds.push(+(performance.now()-start).toFixed(3));
    if(JSON.stringify(value)!==JSON.stringify(expected))throw Error('Semantic mismatch');
  }
  return {milliseconds,medianMs:[...milliseconds].sort((a,b)=>a-b)[1]};
}
const report={observedAt:new Date().toISOString(),environment:{node:process.version,platform:process.platform,architecture:process.arch},
  limits:'Node/Linux synthetic-input measurements, not iPhone or Hermes performance. Legacy read/rewrite are exact previous regex implementations reproduced above, measured only up to 40k characters. Correctness of SQLite rename is checked separately against real Node SQLite.',
  sourceSha256:sha('src/core.ts'),storageSha256:sha('src/storage.ts'),compiledSha256:sha('.test-build/core.js'),rows:[]};
for(const fn of [legacyRead,wikiLinks,legacyRewrite,rewrite])fn('['.repeat(100));
for(const kind of ['open-brackets','unclosed-aliases']) {
  for(const length of [5000,10000,20000,40000,1000000]) {
    const input=kind==='open-brackets'?'['.repeat(length):'[[x|'.repeat(length/4);
    const row={kind,characters:input.length,
      legacyRead:length<=40000?measure(legacyRead,input,[]):null,
      scannerRead:measure(wikiLinks,input,[]),
      legacyRewrite:length<=40000?measure(legacyRewrite,input,input):null,
      scannerRewrite:measure(rewrite,input,input)};
    report.rows.push(row);process.stdout.write(JSON.stringify(row)+'\n');
  }
}
fs.writeFileSync(path.join(__dirname,'wiki-scanner-probe.json'),JSON.stringify(report,null,2)+'\n');
