const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');

const sourceScript = path.resolve(__dirname, '..', 'start-codespaces.sh');
const runner = `#!/usr/bin/env bash
printf '%s|%s|%s\\n' "$(basename "$0")" "$PWD" "$*" >> "$CALLS_LOG"
case "$(basename "$0")" in
  node)
    if [[ "$1" == '--version' ]]; then echo v24.22.2; exit 0; fi
    if [[ "$MOCK_NGROK_INSTALLED" == 1 ]]; then exit 0; else exit 1; fi;;
  npm)
    if [[ "$1" == '--version' ]]; then echo 11.0; exit 0; fi
    if [[ "$1" == 'ci' ]]; then mkdir -p node_modules/.bin; touch node_modules/.bin/expo; chmod +x node_modules/.bin/expo; fi;;
  npx)
    if [[ "$*" == *'whoami'* && "$MOCK_SIGNED_IN" != 1 ]]; then exit 1; fi;;
esac
exit 0
`;

function launch({installed=false, ngrok=true, signedIn=true}={}) {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'rusukh-browser-'));
  try {
    const app=path.join(root,'expo-preview'), bin=path.join(root,'fake-bin');
    fs.mkdirSync(app,{recursive:true});fs.mkdirSync(bin);
    fs.copyFileSync(sourceScript,path.join(app,'start-codespaces.sh'));
    fs.writeFileSync(path.join(app,'package.json'),'{}\n');
    fs.writeFileSync(path.join(app,'package-lock.json'),'{}\n');
    const originals=['package.json','package-lock.json'].map(name=>fs.readFileSync(path.join(app,name),'utf8'));
    for(const command of ['node','npm','npx']) {const filename=path.join(bin,command);fs.writeFileSync(filename,runner,{mode:0o755});}
    if (installed){fs.mkdirSync(path.join(app,'node_modules/.bin'),{recursive:true});fs.writeFileSync(path.join(app,'node_modules/.bin/expo'),'',{mode:0o755});}
    const calls=path.join(root,'calls.log');
    const output=spawnSync('bash',[path.join(app,'start-codespaces.sh')],{
      cwd:root, encoding:'utf8', timeout:8000,
      env:{...process.env,PATH:bin+':'+process.env.PATH,CALLS_LOG:calls,MOCK_NGROK_INSTALLED:ngrok?'1':'0',MOCK_SIGNED_IN:signedIn?'1':'0'},
    });
    return {output,calls:fs.existsSync(calls)?fs.readFileSync(calls,'utf8').trim().split('\n'):[],root,app,originals,updated:['package.json','package-lock.json'].map(name=>fs.readFileSync(path.join(app,name),'utf8'))};
  } finally { fs.rmSync(root,{recursive:true,force:true}); }
}

test('browser-only launcher enters expo-preview even from the repo root and uses a locked installation',()=>{
  const result=launch({ngrok:true});
  assert.equal(result.output.status,0,result.output.stderr);
  const cmds=result.calls.filter(line=>line.startsWith('npm|')||line.startsWith('npx|'));
  assert.ok(cmds.every(line=>line.split('|')[1].endsWith('/expo-preview')),cmds.join('\n'));
  assert.ok(cmds.some(line=>line.endsWith('|ci --no-audit --no-fund')),cmds.join('\n'));
  assert.ok(cmds.some(line=>line.includes('expo start --tunnel')),cmds.join('\n'));
});

test('already installed dependencies and signed-in user do not trigger reinstall or redundant login',()=>{
  const result=launch({installed:true,ngrok:true,signedIn:true});
  assert.equal(result.output.status,0,result.output.stderr);
  assert.equal(result.calls.filter(line=>line.includes('npm|') && !line.endsWith('|--version')).length,0,result.calls.join('\n'));
  assert.equal(result.calls.filter(line=>line.includes('expo login')).length,0,result.calls.join('\n'));
  assert.deepEqual(result.updated,result.originals);
});

test('missing tunnel helper installs locally without saving package or lock; login remains interactive if needed',()=>{
  const result=launch({installed:true,ngrok:false,signedIn:false});
  assert.equal(result.output.status,0,result.output.stderr);
  assert.ok(result.calls.some(line=>line.includes('npm|')&&line.includes('install --no-save --package-lock=false --no-audit --no-fund @expo/ngrok')),result.calls.join('\n'));
  assert.ok(result.calls.some(line=>line.includes('expo login')),result.calls.join('\n'));
  assert.deepEqual(result.updated,result.originals);
});
