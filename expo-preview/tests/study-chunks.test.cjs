const test=require('node:test');const assert=require('node:assert/strict');
const {studyChunks}=require('../.test-build/studyChunks.js');
test('long Arabic transcripts retain all facts and exact source offsets',()=>{
 const source='المصدر: محاضرة\n'+('التعلم النشط يحسن الاسترجاع.\n'.repeat(240))+'حقيقة مهمة في آخر النص';
 const chunks=studyChunks(source);
 assert.equal(chunks.map(c=>c.text).join(''),source);
 for(const c of chunks){assert.ok(c.text.length<=1600);assert.equal(source.slice(c.start,c.end),c.text);}
 assert.ok(chunks.at(-1).text.includes('حقيقة مهمة في آخر النص'));
});
test('emoji are not split and invalid limits cannot cause a loop',()=>{
 const source='📖'.repeat(999);const chunks=studyChunks(source,33);
 assert.equal(chunks.map(c=>c.text).join(''),source);
 assert.ok(chunks.every(c=>!/[\uD800-\uDBFF]$/.test(c.text)));
 for(const limit of [0,-1,NaN,Infinity,1.2]) assert.throws(()=>studyChunks('abc',limit));
 assert.deepEqual(studyChunks(''),[]);
});
test('default study chunks keep short final facts selectable by the local AI source contract',()=>{
 const {boundSource}=require('../.test-build/ai/contracts.js');
 for(const source of ['ع'.repeat(1600)+'حقيقة', 'ع'.repeat(1599)+'📖'+'حقيقة', 'ع'.repeat(1580)+'📖'+'ب'.repeat(18)+'حقيقة', 'ع'.repeat(1600)+' \nحقيقة \n']) {
  const chunks=studyChunks(source);
  assert.equal(chunks.map(c=>c.text).join(''),source);
  for(const chunk of chunks) {
   assert.equal(source.slice(chunk.start,chunk.end),chunk.text);
   assert.doesNotThrow(()=>boundSource(chunk.text),`chunk ${chunk.index+1} must retain enough adjacent context to study`);
   assert.ok(!/[\uD800-\uDBFF]$/.test(chunk.text));
  }
 }
});
test('tail rebalancing respects custom limits even when two minimum-sized chunks are impossible',()=>{
 for(const [source,limit] of [['ع'.repeat(65),33],['ع'.repeat(33),32],['ع'.repeat(30)+' '.repeat(80)+'حقيقة',32]]) {
  const chunks=studyChunks(source,limit);
  assert.equal(chunks.map(c=>c.text).join(''),source);
  for(const c of chunks){assert.ok(c.text.length>0 && c.text.length<=limit);assert.equal(source.slice(c.start,c.end),c.text);}
 }
});
