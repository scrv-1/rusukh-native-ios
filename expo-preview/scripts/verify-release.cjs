const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const {createHash} = require('node:crypto');
const root = path.resolve(__dirname, '..');
const version = require('../package.json').version;
if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('Expected a stable semver version');
if (require('../app.json').expo.version !== version) throw new Error('App and package versions differ');
if (require('../app.json').expo.extra.appVersion !== version) throw new Error('Extra app version differs');
const tag = 'v' + version.replaceAll('.', '');
const out = path.join(root, 'evidence', tag);
fs.mkdirSync(out,{recursive:true});
const sourceHashes = {};
function hashSource(relative) {
  const file = path.join(root, relative);
  if (fs.statSync(file).isDirectory()) {
    for (const name of fs.readdirSync(file).sort()) hashSource(path.join(relative, name));
  } else {
    sourceHashes[relative] = createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  }
}
for (const relative of ['App.tsx','src','tests','ai-lab/build.mjs','ai-lab/engine-entry.mjs','ai-lab/engine-runtime.test.mjs','ai-lab/test.mjs','ai-lab/package.json','ai-lab/package-lock.json','package.json','package-lock.json','app.json','scripts/verify-release.cjs','scripts/verify-ai-build.cjs','scripts/verify-live-expo.py','scripts/build-ux-register.py']) hashSource(relative);
fs.writeFileSync(path.join(out,'source-sha256.json'), JSON.stringify(sourceHashes,null,2)+'\n');
const checks = [
  ['ai-build-integrity','node',['scripts/verify-ai-build.cjs']],
  ['core-tests','npm',['test']],
  ['ai-contract-tests','node',['--test','ai-lab/test.mjs','ai-lab/engine-runtime.test.mjs']],
  ['ui-tests','npm',['run','test:ui']],
  ['typecheck','npm',['run','typecheck']],
  ['expo-compatibility','npx',['expo','install','--check']],
  ['expo-doctor','npx',['--yes','expo-doctor']],
  ['ios-export','npx',['expo','export','--platform','ios','--output-dir','dist-' + tag]],
];
const results=[];
for(const [name,cmd,args] of checks) {
  const start=Date.now();
  const r=spawnSync(cmd,args,{cwd:root,encoding:'utf8',env:{...process.env,CI:'1',NO_COLOR:'1'},maxBuffer:32*1024*1024,timeout:600000});
  const log=(r.stdout??'')+(r.stderr??'')+(r.error?'\n'+r.error.message:'');
  fs.writeFileSync(path.join(out,name+'.txt'),log);
  const record={name,exitCode:r.status,signal:r.signal,milliseconds:Date.now()-start};
  results.push(record); console.log(JSON.stringify(record));
  fs.writeFileSync(path.join(out,'verification.json'),JSON.stringify({version,observedAt:new Date().toISOString(),node:process.version,checks:results},null,2)+'\n');
  if(r.status!==0) {console.log(log.slice(-2400));process.exit(1);}
}
