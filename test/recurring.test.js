import test from 'node:test';
import assert from 'node:assert/strict';
import { expandRecurrences, nextOccurrence, normalizeRecurrence, occurrenceDates } from '../public/js/domain/recurring.js';
import { accountSummary } from '../public/js/domain/accounts.js';
import { categorize } from '../public/js/domain/categorize.js';
import { createRepository } from '../public/js/data/repository.js';

const rent = { kind: 'expense', frequency: 'monthly', date: '2026-01-31', amount: '800', account: 'Banca', category: 'Casa', comment: 'Affitto' };

test('occurrences repeat from the base date without drifting', () => {
  assert.deepEqual(occurrenceDates(rent, '2026-04-30'), ['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30']);
  assert.deepEqual(occurrenceDates({ ...rent, frequency: 'weekly', date: '2026-10-20' }, '2026-11-02'), ['2026-10-20', '2026-10-27']);
  assert.deepEqual(occurrenceDates({ ...rent, frequency: 'daily', date: '2026-10-31' }, '2026-11-02'), ['2026-10-31', '2026-11-01', '2026-11-02']);
  assert.deepEqual(occurrenceDates({ ...rent, frequency: 'yearly', date: '2024-02-29' }, '2026-11-02'), ['2024-02-29', '2025-02-28', '2026-02-28']);
  assert.deepEqual(occurrenceDates({ ...rent, date: '2026-12-01' }, '2026-11-02'), []);
});

test('an end date stops the occurrences', () => {
  const ended = { ...rent, endDate: '2026-03-15' };
  assert.deepEqual(occurrenceDates(ended, '2026-11-02'), ['2026-01-31', '2026-02-28']);
  assert.equal(nextOccurrence(ended, '2026-11-02'), null);
  assert.equal(nextOccurrence(rent, '2026-11-02'), '2026-11-30');
});

test('recurrence input is validated', () => {
  const { recurrence } = normalizeRecurrence(rent);
  assert.equal(recurrence.amount, 800);
  assert.equal(recurrence.frequency, 'monthly');
  assert.equal(recurrence.endDate, null);
  assert.equal(normalizeRecurrence({ ...rent, frequency: 'hourly' }).field, 'frequency');
  assert.equal(normalizeRecurrence({ ...rent, amount: '' }).field, 'amount');
  assert.equal(normalizeRecurrence({ ...rent, endDate: '2025-12-31' }).field, 'endDate');
  assert.equal(normalizeRecurrence({ ...rent, date: '0026-01-31' }).field, 'date');
});

test('only occurrences from the creation day on move the balance', () => {
  const recurrence = { id: 'r-1', ...normalizeRecurrence(rent).recurrence, createdAt: '2026-03-10T09:00:00.000Z' };
  const occurrences = expandRecurrences([recurrence], '2026-05-01');
  assert.deepEqual(occurrences.map((o) => o.id), ['r-1@2026-01-31', 'r-1@2026-02-28', 'r-1@2026-03-31', 'r-1@2026-04-30']);
  assert.deepEqual(occurrences.map((o) => o.createdAt), [null, null, '2026-03-31T00:00:00.000Z', '2026-04-30T00:00:00.000Z']);
  const account = { id: 'a', name: 'Banca', balance: 5000, balanceAt: '2026-04-01T08:00:00.000Z' };
  assert.equal(accountSummary([account], [], occurrences).rows[0].current, 4200);
  assert.deepEqual(categorize(occurrences[0], { rules: [], overrides: {} }), { category: 'Casa', source: 'entry', ruleId: null });
});

function memoryStorage(initial = {}) {
  const blobs = new Map(Object.entries(initial));
  return { blobs, read: async (name) => structuredClone(blobs.get(name) ?? null), write: async (name, value) => { blobs.set(name, structuredClone(value)); } };
}

test('the repository adds, edits, renames and deletes recurrences', async () => {
  const storage = memoryStorage({ accounts: [{ id: 'a', name: 'Banca', balance: 0, balanceAt: '2026-01-01T00:00:00.000Z' }] });
  const repo = createRepository(storage);
  let list = await repo.addRecurrence(rent);
  assert.match(list[0].id, /^r-/);
  await assert.rejects(() => repo.addRecurrence({ ...rent, account: 'Altro' }), /conto/);

  list = await repo.updateRecurrence(list[0].id, { ...rent, date: '2026-02-01', frequency: 'weekly' });
  assert.equal(list[0].date, '2026-02-01');
  assert.equal(list[0].frequency, 'weekly');

  const { recurrences } = await repo.updateAccount('a', { name: 'Conto', icon: 'bank', color: '#2337c6' });
  assert.equal(recurrences[0].account, 'Conto');
  assert.deepEqual(await repo.deleteRecurrence(list[0].id), []);
  assert.deepEqual(storage.blobs.get('recurring'), []);
});
