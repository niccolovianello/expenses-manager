import test from 'node:test';
import assert from 'node:assert/strict';
import { duplicateKey, normalizeEntry, parseAmount } from '../public/js/domain/entries.js';
import { categorize } from '../public/js/domain/categorize.js';
import { createRepository } from '../public/js/data/repository.js';

const expense = { kind: 'expense', date: '2026-10-29', amount: '12,50', account: 'Carta', category: 'Svago', comment: ' Cinema ' };

test('amounts accept a decimal comma and thousands separators', () => {
  assert.equal(parseAmount('12,50'), 12.5);
  assert.equal(parseAmount('1.234,56 €'), 1234.56);
  assert.equal(parseAmount('7.5'), 7.5);
  assert.ok(Number.isNaN(parseAmount('')));
});

test('a valid transaction is normalized', () => {
  const { entry } = normalizeEntry(expense);
  assert.equal(entry.amount, 12.5);
  assert.equal(entry.comment, 'Cinema');
  assert.equal(entry.sourceCategory, 'Svago');
  assert.equal(entry.toAccount, null);
});

test('missing or inconsistent data produces a clear message', () => {
  assert.match(normalizeEntry({ ...expense, amount: '0' }).error, /importo/);
  assert.match(normalizeEntry({ ...expense, date: '2026-02-30' }).error, /data/);
  assert.match(normalizeEntry({ ...expense, category: '' }).error, /categoria/);
  assert.match(normalizeEntry({ ...expense, kind: 'transfer', toAccount: '' }).error, /destinazione/);
  assert.match(normalizeEntry({ ...expense, kind: 'transfer', toAccount: 'Carta' }).error, /diversi/);
  assert.equal(normalizeEntry({ ...expense, kind: 'transfer', toAccount: 'Contanti', category: '' }).entry.sourceCategory, null);
});

test('rules do not change the category chosen for a manual transaction', () => {
  const rule = { id: 'r', kind: 'expense', field: 'comment', operator: 'contains', value: 'cinema', category: 'Altro', enabled: true };
  const tx = { id: 'm-1', origin: 'manual', ...normalizeEntry(expense).entry };
  assert.deepEqual(categorize(tx, { rules: [rule], overrides: {} }), { category: 'Svago', source: 'entry', ruleId: null });
});

function memoryStorage(initial = {}) {
  const blobs = new Map(Object.entries(initial));
  return { blobs, read: async (name) => structuredClone(blobs.get(name) ?? null), write: async (name, value) => { blobs.set(name, structuredClone(value)); } };
}

test('the repository adds, edits and deletes manual transactions', async () => {
  const storage = memoryStorage();
  const repo = createRepository(storage);
  let entries = await repo.addEntry(expense);
  assert.equal(entries.length, 1);
  const [first] = entries;
  assert.match(first.id, /^m-/);
  assert.equal(first.origin, 'manual');

  entries = await repo.updateEntry(first.id, { ...expense, amount: '20' });
  assert.equal(entries[0].amount, 20);
  assert.equal(entries[0].createdAt, first.createdAt);

  await assert.rejects(() => repo.addEntry({ ...expense, account: '' }), /conto/);
  entries = await repo.deleteEntry(first.id);
  assert.deepEqual(entries, []);
  assert.deepEqual(storage.blobs.get('entries'), []);
});

test('the duplicate key ignores descriptions and categories', () => {
  const imported = { kind: 'expense', date: '2026-10-29', amount: 12.5, account: 'Carta', toAccount: null, comment: 'altro testo' };
  assert.equal(duplicateKey(imported), duplicateKey(normalizeEntry(expense).entry));
});
