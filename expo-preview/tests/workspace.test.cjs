const test = require('node:test');
const assert = require('node:assert/strict');
const { defaultWorkspace, readWorkspace, toggleModule, moveModule, pinnedModules, MODULES } = require('../.test-build/workspace.js');
const { prepareSource, MAX_SOURCE_BYTES, matchesSearch, markdownNote } = require('../.test-build/sources.js');

test('new workspace is calm and independent between callers', () => {
  const a = defaultWorkspace(); a.modules[0].enabled = false;
  assert.deepEqual(pinnedModules(defaultWorkspace()), ['review', 'notes']);
});
test('invalid settings recover without throwing', () => {
  for (const raw of [null, '', '{', 'null', '[]', '{"version":2}', 'x'.repeat(10001)]) {
    assert.deepEqual(readWorkspace(raw), defaultWorkspace());
  }
});
test('saved settings round trip with order, density and hidden tools intact', () => {
  const edited = moveModule(toggleModule(defaultWorkspace(), 'graph'), 'graph', -1);
  edited.density = 'compact';
  assert.deepEqual(readWorkspace(JSON.stringify(edited)), edited);
});
test('unknown and duplicate IDs never produce duplicate or unsupported tools', () => {
  const result = readWorkspace(JSON.stringify({version:1, modules:[{id:'notes',enabled:false},{id:'notes',enabled:true},{id:'evil',enabled:true},{id:'review',enabled:'yes'},null]}));
  assert.equal(result.modules.length, MODULES.length);
  assert.equal(new Set(result.modules.map(m=>m.id)).size, MODULES.length);
  assert.equal(result.modules[0].enabled, false);
  assert.ok(result.modules.every(m=>!m.enabled));
});
test('hiding every module is valid and does not mutate original preferences', () => {
  const original = defaultWorkspace();
  let next = original;
  for (const m of original.modules.filter(m=>m.enabled)) next = toggleModule(next, m.id);
  assert.deepEqual(pinnedModules(next), []);
  assert.deepEqual(readWorkspace(JSON.stringify(next)), next);
  assert.equal(original.modules[0].enabled, true);
});
test('reorder respects boundaries and preserves each module exactly once', () => {
  const original = defaultWorkspace();
  assert.deepEqual(moveModule(original, 'review', -1), original);
  assert.deepEqual(moveModule(original, 'ai', 1), original);
  const next = moveModule(original,'notes',-1);
  assert.deepEqual(pinnedModules(next),['notes','review']);
  assert.deepEqual(moveModule(next,'notes',1),original);
});
test('tab bar respects order and caps optional pages at three, excluding quiz', () => {
  const value=defaultWorkspace(); value.modules.forEach(m=>m.enabled=true);
  value.modules.unshift(value.modules.splice(3,1)[0]);
  assert.deepEqual(pinnedModules(value),['review','notes','graph']);
});
test('text sources preserve Arabic, Q/A and transcript timestamps', () => {
  const source='\uFEFFWEBVTT\r\n\r\n00:00:01.000 --> 00:00:03.000\r\nس: ما العلم؟\r\nج: معرفة';
  const prepared=prepareSource('درس.VTT', source);
  assert.equal(prepared.title,'درس');
  assert.ok(prepared.body.includes('00:00:01.000 --> 00:00:03.000\nس: ما العلم؟'));
  assert.ok(!prepared.body.includes('\r'));
});
test('source import rejects unsupported, oversized, empty and invalid text', () => {
  for (const [name,body] of [['x.pdf','pdf'],['x.txt',''],['x.srt','\0bad'],['x.txt','\uFFFD'],['x.txt','a'.repeat(MAX_SOURCE_BYTES+1)]]) {
    assert.throws(()=>prepareSource(name,body));
  }
});
test('Arabic search ignores diacritics, tatweel, alef forms and word order', () => {
  assert.ok(matchesSearch('التعلُّم النشِط', 'إسترجاع الـمعلومات', 'المعلومات تعلم'));
  assert.ok(matchesSearch('SCIENCE', 'العلم', 'science'));
  assert.ok(!matchesSearch('التعلم', '', 'التعلم المفقود'));
  assert.ok(matchesSearch('أي شيء', '', '  '));
});
test('markdown export preserves note body and wiki links', () => {
  assert.equal(markdownNote('درس\nأول','س: ماذا؟\nج: [[علم]]'),'# درس أول\n\nس: ماذا؟\nج: [[علم]]\n');
});
test('source limit includes metadata so every accepted source can be reimported from backup', () => {
  const { validateBackup } = require('../.test-build/core.js');
  const { MAX_NOTE_CHARS } = require('../.test-build/sources.js');
  const headerLength = 'المصدر: x.txt\n\n'.length;
  const note = prepareSource('x.txt','a'.repeat(MAX_NOTE_CHARS-headerLength));
  assert.ok(validateBackup({format:'rusukh-backup',version:1,notes:[{...note,id:'n',createdAt:1,updatedAt:1}],cards:[],reviews:[]}));
  assert.throws(()=>prepareSource('x.txt','a'.repeat(MAX_NOTE_CHARS-headerLength+1)));
});

test('adding the AI module preserves prior layout and keeps the new tool hidden', () => {
  const old = {version:1,density:'compact',modules:defaultWorkspace().modules.filter(m=>m.id!=='ai')};
  const restored = readWorkspace(JSON.stringify(old));
  assert.deepEqual(restored.modules.slice(0,-1),old.modules);
  assert.deepEqual(restored.modules.at(-1),{id:'ai',enabled:false});
});
