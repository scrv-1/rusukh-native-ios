const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const root = path.resolve(__dirname, '..');
const out = path.join(root, 'evidence/v04');
fs.mkdirSync(out,{recursive:true});
const checks = [
  ['core-tests','npm',['test']],
  ['ai-contract-tests','node',['--test','ai-lab/test.mjs']],
  ['ui-tests','npm',['run','test:ui']],
  ['typecheck','npm',['run','typecheck']],
  ['expo-compatibility','npx',['expo','install','--check']],
  ['expo-doctor','npx',['--yes','expo-doctor']],
  ['ios-export','npx',['expo','export','--platform','ios','--output-dir','dist-v04']],
];
const results=[];
for(const [name,cmd,args] of checks) {
  const start=Date.now();
  const r=spawnSync(cmd,args,{cwd:root,encoding:'utf8',env:{...process.env,CI:'1',NO_COLOR:'1'},maxBuffer:32*1024*1024,timeout:600000});
  const log=(r.stdout??'')+(r.stderr??'')+(r.error?'\n'+r.error.message:'');
  fs.writeFileSync(path.join(out,name+'.txt'),log);
  const record={name,exitCode:r.status,signal:r.signal,milliseconds:Date.now()-start};
  results.push(record); console.log(JSON.stringify(record));
  fs.writeFileSync(path.join(out,'verification.json'),JSON.stringify({observedAt:new Date().toISOString(),node:process.version,checks:results},null,2)+'\n');
  if(r.status!==0) {console.log(log.slice(-2400));process.exit(1);}
}
