const test = require('node:test');
const assert = require('node:assert/strict');
const { scheduleReview, validateBackup, serializeBackup } = require('../.test-build/core.js');

function backup(card) {
  return { format: 'rusukh-backup', version: 1, exportedAt: '2026-11-03T10:00:00Z',
    notes: [{ id: 'n1', title: 'درس', body: 'مصدر', createdAt: 1, updatedAt: 1 }],
    cards: [card], reviews: [] };
}

for (const grade of ['again', 'hard', 'good', 'easy']) {
  test(`accepted imported scheduling boundaries remain exportable after ${grade}`, () => {
    const now = Date.UTC(2026, 10, 3);
    for (const intervalDays of [0, 364999, 365000]) {
      for (const repetitions of [0, 99999, 100000]) {
        const card = { id: 'c1', noteId: 'n1', question: 'سؤال', answer: 'جواب',
          dueAt: now, updatedAt: now, intervalDays, repetitions, ease: 5 };
        const before = structuredClone(card);
        assert.equal(validateBackup(backup(card)), true, 'fixture is accepted at import');
        const reviewed = scheduleReview(card, grade, now);
        assert.deepEqual(card, before, 'review must not mutate the input');
        assert.equal(validateBackup(backup(reviewed)), true,
          `review breaks export: interval=${intervalDays}, repetitions=${repetitions}`);
        assert.deepEqual(JSON.parse(serializeBackup(backup(reviewed))).cards[0], reviewed);
        assert.ok(reviewed.dueAt > now);
      }
    }
  });
}
