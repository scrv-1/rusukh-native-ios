#!/usr/bin/env node
/**
 * Synthetic, bounded Linux/Node benchmark of the app's actual compiled storage
 * and core functions. No React Native, iPhone, battery, thermal, ANE, or UI claim.
 * Run from expo-preview after `tsc -p tsconfig.test.json`:
 *   node evidence/v04/linux-storage-benchmark.cjs [report-name.json] [source-label]
 * Only the JSON report is retained; all synthetic SQLite files are removed.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { performance } = require('node:perf_hooks');
const { DatabaseSync } = require('node:sqlite');
const Module = require('node:module');

const project = path.resolve(__dirname, '../..');
const reportName = process.argv[2] ?? 'linux-storage-benchmark.json';
if (!/^[a-z0-9-]+\.json$/.test(reportName)) throw new Error('Use a report basename ending in .json');
const resultPath = path.join(__dirname, reportName);
const count = 2000, reviewedCount = 500;
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'rusukh-v04-benchmark-'));
let activeRaw;
const openDatabases = new Set();
function adapter(raw) {
  return {
    execAsync: async sql => raw.exec(sql),
    runAsync: async (sql, ...args) => raw.prepare(sql).run(...args),
    getFirstAsync: async (sql, ...args) => raw.prepare(sql).get(...args) ?? null,
    getAllAsync: async (sql, ...args) => raw.prepare(sql).all(...args),
    withExclusiveTransactionAsync: async fn => {
      raw.exec('BEGIN IMMEDIATE');
      try { const value = await fn(adapter(raw)); raw.exec('COMMIT'); return value; }
      catch (error) { raw.exec('ROLLBACK'); throw error; }
    },
  };
}
function open(name) {
  activeRaw = new DatabaseSync(path.join(temp, name));
  openDatabases.add(activeRaw);
  return activeRaw;
}
function close(raw) { raw.close(); openDatabases.delete(raw); }
const originalLoad = Module._load;
let storage;
try {
  Module._load = function(name, ...rest) {
    return name === 'expo-sqlite'
      ? { openDatabaseAsync: async () => adapter(activeRaw) }
      : originalLoad.call(this, name, ...rest);
  };
  storage = require(path.join(project, '.test-build/storage.js'));
} finally { Module._load = originalLoad; }
const core = require(path.join(project, '.test-build/core.js'));
const sources = require(path.join(project, '.test-build/sources.js'));
const workspace = require(path.join(project, '.test-build/workspace.js'));
const sha = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const memory = () => {
  const current = process.memoryUsage();
  return { rssBytes: current.rss, heapUsedBytes: current.heapUsed,
    processPeakRssBytes: process.resourceUsage().maxRSS * 1024 };
};
const normalize = data => Object.fromEntries(['notes','cards','reviews'].map(kind =>
  [kind, [...data[kind]].sort((a,b) => a.id.localeCompare(b.id))]));
const sameData = (actual, expected) => assert.deepEqual(
  JSON.parse(JSON.stringify(normalize(actual))), JSON.parse(JSON.stringify(normalize(expected))));
const report = {
  status: 'running', startedAt: new Date().toISOString(),
  releaseReference: { baseCommit: '0d7b1a0', sourceLabel: process.argv[3] ?? 'release source', version: 'Expo 0.4.0',
    verification: 'Remote commit supplied by release task; extracted local tree has no Git metadata. Exact local source and compiled input hashes are recorded below.' },
  scope: 'Linux Node SQLite adapter executing actual compiled app functions; synthetic content only',
  notMeasured: ['iPhone performance','React Native bridge cost','UI frame rate','battery','temperature','Neural Engine','concurrent writers'],
  environment: { node: process.version, platform: process.platform, architecture: process.arch,
    kernel: os.release(), logicalCpus: os.cpus().length, cpuModel: os.cpus()[0]?.model,
    hostReportedMemoryBytes: os.totalmem(), sqlite: null },
  sourceSha256: Object.fromEntries(['src/storage.ts','src/core.ts','src/sources.ts','src/workspace.ts',
    '.test-build/storage.js','.test-build/core.js','.test-build/sources.js','.test-build/workspace.js']
    .map(file => [file,sha(path.join(project,file))])),
  input: { notes: count, cards: count, reviews: reviewedCount, sparseDirectedEdges: count*2,
    denseDirectedEdges: count*10, backupLimitBytes: core.MAX_BACKUP_BYTES },
  initialMemory: memory(), stages: [], checks: {},
};
async function stage(name, fn) {
  const start = performance.now(), before = memory();
  const value = await fn();
  const row = { name, elapsedMs: Number((performance.now()-start).toFixed(3)), before, after: memory() };
  report.stages.push(row);
  process.stdout.write(`${name}: ${row.elapsedMs} ms\n`);
  return value;
}

(async () => {
  const started = performance.now();
  try {
    const sourceRaw = open('source.sqlite');
    report.environment.sqlite = sourceRaw.prepare('SELECT sqlite_version() AS version').get().version;
    const db = await stage('open_actual_schema_and_clear_demo_seed', async () => {
      const db = await storage.openStorage();
      await storage.restoreBackup(db, storage.makeBackup([],[],[]));
      return db;
    });
    assert.equal(sourceRaw.prepare('PRAGMA foreign_keys').get().foreign_keys,1);
    const base = 1700000000000;
    const title = i => `درس ${String(i).padStart(4,'0')} — التعلّم العربي`;
    const paragraph = 'المُراجَعَة النَّشِطَة تثبّت المعرفة. تربط المراجعة المتباعدة بين الأفكار وتساعد الطالب على استرجاع المعلومات وفهم العلاقات. ';
    const notes = Array.from({length:count}, (_, i) => ({
      id: `synthetic-note-${i}`, title: title(i),
      body: `${paragraph.repeat(6)}\nمجموعة${String(i%20).padStart(2,'0')}\n[[${title((i+1)%count)}]] [[${title((i+count-1)%count)}|الدرس السابق]]\nس: ما محور الدرس ${i}؟\nج: مراجعة المعرفة وربط الأفكار رقم ${i}.`,
      createdAt: base+i, updatedAt: base+i,
    }));
    const cards = notes.map((note,i) => {
      const pairs=core.parseQuestionAnswer(note.body);assert.equal(pairs.length,1);
      return {id:`synthetic-card-${i}`,noteId:note.id,...pairs[0],dueAt:base,intervalDays:0,ease:2.5,repetitions:0,updatedAt:base};
    });
    await stage('persist_2000_notes_and_cards_2000_actual_transactions', async () => {
      for(let i=0;i<count;i++) await storage.saveNoteAndCards(db,notes[i],[cards[i]]);
    });
    const preferred = workspace.toggleModule(workspace.defaultWorkspace(),'graph');
    await storage.setSetting(db,workspace.WORKSPACE_KEY,JSON.stringify(preferred));
    await stage('record_500_reviews_actual_scheduler_and_transactions', async () => {
      for(let i=0;i<reviewedCount;i++) await storage.recordReview(db,cards[i],['again','hard','good','easy'][i%4]);
    });
    const snapshot = await stage('read_2000_notes_2000_cards_500_reviews',()=>storage.readAll(db));
    assert.equal(snapshot.notes.length,count);assert.equal(snapshot.cards.length,count);assert.equal(snapshot.reviews.length,reviewedCount);
    sameData({notes:snapshot.notes,cards, reviews:[]},{notes,cards,reviews:[]});
    const currentCards = new Map(snapshot.cards.map(c=>[c.id,c]));
    const originalCards = new Map(cards.map(c=>[c.id,c]));
    for(const event of snapshot.reviews) {
      assert.deepEqual({...currentCards.get(event.cardId)},core.scheduleReview(originalCards.get(event.cardId),event.grade,event.reviewedAt));
    }
    assert.equal(core.dueCards(snapshot.cards,Date.now()).length,count-reviewedCount);
    assert.equal(new Set(snapshot.reviews.map(r=>r.id)).size,reviewedCount);
    report.checks.reviewSchedulingAndRetention=true;

    const edges=await stage('sparse_graph_2000_notes_4000_edges',()=>core.graphEdges(snapshot.notes));
    assert.equal(edges.length,count*2);
    assert.equal(new Set(edges.map(e=>`${e.from}\0${e.to}`)).size,count*2);
    report.checks.sparseGraphExactUniqueEdges=true;
    const denseNotes = notes.map((note,i) => ({...note,body:
      Array.from({length:10},(_,offset)=>`[[${title((i+offset+1)%count)}]]`).join(' ')+
      ` [[${title((i+1)%count)}|alias]] [[  ${title((i+1)%count)}  ]] [[${note.title}]]`}));
    const denseRuns=[];
    for(let run=1;run<=3;run++) {
      const dense=await stage(`dense_graph_2000_notes_20000_edges_run_${run}`,()=>core.graphEdges(denseNotes));
      denseRuns.push(report.stages.at(-1).elapsedMs);
      assert.equal(dense.length,count*10);assert.equal(new Set(dense.map(e=>`${e.from}\0${e.to}`)).size,count*10);
      assert.ok(dense.every(e=>e.from!==e.to));
      assert.deepEqual(dense.slice(0,10),Array.from({length:10},(_,offset)=>({from:notes[0].id,to:notes[offset+1].id})));
    }
    report.denseGraphMedianMs=[...denseRuns].sort((a,b)=>a-b)[1];
    report.checks.denseGraphCountOrderAliasesSelfLinks=true;

    await stage('arabic_search_20_queries_over_2000_notes',()=>{
      for(let group=0;group<20;group++) {
        const query=`مراجعة نشطة مجموعة${String(group).padStart(2,'0')}`;
        const found=snapshot.notes.filter(n=>sources.matchesSearch(n.title,n.body,query));
        assert.equal(found.length,100);
      }
    });
    report.checks.arabicSearch20ExactResultSets=true;
    const json=await stage('validate_and_serialize_backup',()=>core.serializeBackup(storage.makeBackup(snapshot.notes,snapshot.cards,snapshot.reviews)));
    report.backupUtf8Bytes=Buffer.byteLength(json,'utf8');
    assert.ok(report.backupUtf8Bytes<=core.MAX_BACKUP_BYTES);
    const backup=await stage('parse_and_validate_backup',()=>{
      const parsed=JSON.parse(json);assert.equal(core.validateBackup(parsed),true);return parsed;
    });
    sameData(backup,snapshot);report.checks.exportParseExactEquality=true;
    const targetRaw=open('restore.sqlite');
    const target=await storage.openStorage();
    await storage.setSetting(target,workspace.WORKSPACE_KEY,JSON.stringify(preferred));
    await stage('restore_4500_records_single_actual_transaction',()=>storage.restoreBackup(target,backup));
    sameData(await storage.readAll(target),snapshot);
    assert.deepEqual(targetRaw.prepare('PRAGMA foreign_key_check').all(),[]);
    assert.equal(await storage.getSetting(target,workspace.WORKSPACE_KEY),JSON.stringify(preferred));
    report.checks.restoreExactEqualityAndWorkspaceRetention=true;
    await assert.rejects(target.runAsync('INSERT INTO cards VALUES (?,?,?,?,?,?,?,?,?)',
      'orphan-card','missing-note','سؤال','جواب',base,0,2.5,0,base),/FOREIGN KEY/);
    sameData(await storage.readAll(target),snapshot);
    report.checks.orphanRejectedWithoutMutation=true;
    await storage.deleteNote(target,notes[0].id);
    const afterDelete=await storage.readAll(target);
    assert.equal(afterDelete.notes.length,count-1);assert.equal(afterDelete.cards.length,count-1);assert.equal(afterDelete.reviews.length,reviewedCount-1);
    assert.deepEqual(targetRaw.prepare('PRAGMA foreign_key_check').all(),[]);
    await storage.restoreBackup(target,backup);
    report.checks.foreignKeyCascadeAndSubsequentRestore=true;
    close(targetRaw);
    const reopenedRaw=open('restore.sqlite');
    await stage('reopen_and_verify_exact_roundtrip',async()=>{
      const reopened=await storage.openStorage();sameData(await storage.readAll(reopened),snapshot);
      assert.deepEqual(reopenedRaw.prepare('PRAGMA foreign_key_check').all(),[]);
      assert.equal(await storage.getSetting(reopened,workspace.WORKSPACE_KEY),JSON.stringify(preferred));
    });
    report.checks.reopenExactEqualityAndForeignKeys=true;
    report.status='passed';
  } catch(error) {
    report.status='failed';report.failure={name:error.name,message:error.message,stack:error.stack};process.exitCode=1;
  } finally {
    for(const raw of openDatabases) {try{raw.close();}catch{}}
    fs.rmSync(temp,{recursive:true,force:true});
    report.temporarySyntheticDataRemoved=!fs.existsSync(temp);
    report.finishedAt=new Date().toISOString();report.totalElapsedMs=Number((performance.now()-started).toFixed(3));
    report.finalMemory=memory();
    fs.writeFileSync(resultPath,JSON.stringify(report,null,2)+'\n');
    process.stdout.write(JSON.stringify({status:report.status,totalElapsedMs:report.totalElapsedMs,
      denseGraphMedianMs:report.denseGraphMedianMs,backupUtf8Bytes:report.backupUtf8Bytes,
      peakRssMiB:Number((report.finalMemory.processPeakRssBytes/1024/1024).toFixed(2)),
      temporarySyntheticDataRemoved:report.temporarySyntheticDataRemoved,resultPath,failure:report.failure})+'\n');
  }
})();
