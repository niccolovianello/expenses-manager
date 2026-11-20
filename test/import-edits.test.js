import test from 'node:test';
import assert from 'node:assert/strict';
import { applyImportEdits, importEditPatch, sanitizeImportEdits } from '../public/js/domain/import-edits.js';
import { accountSummary } from '../public/js/domain/accounts.js';
import { createRepository } from '../public/js/data/repository.js';

function memoryStorage(initial = {}) {
  const blobs = new Map(Object.entries(initial));
  return { blobs, read: async (name) => structuredClone(blobs.get(name) ?? null), write: async (name, value) => { blobs.set(name, structuredClone(value)); } };
}

const exported = (id, extra = {}) => ({
  id, kind: 'expense', date: '2026-10-10', time: null, amount: 20, currency: 'EUR',
  account: 'Carta', toAccount: null, sourceCategory: 'Spesa', tag: null, comment: 'Supermercato', ...extra,
});

test('only the fields that differ from the export are kept', () => {
  const original = exported('a');
  const patch = importEditPatch(original, { ...original, amount: 25, comment: 'Supermercato', tag: null });
  assert.deepEqual(patch, { amount: 25 });
  assert.deepEqual(importEditPatch(original, { ...original }), {});
});

test('the changes apply by id and remember the export values', () => {
  const [first, second] = applyImportEdits([exported('a'), exported('b')], { a: { amount: 25, comment: 'Pizza' } });
  assert.equal(first.amount, 25);
  assert.equal(first.comment, 'Pizza');
  assert.equal(first.edited, true);
  assert.equal(first.original.amount, 20);
  assert.equal(second.edited, undefined);
});

test('invalid stored changes are dropped', () => {
  assert.deepEqual(sanitizeImportEdits({ a: { amount: -1, kind: 'income', comment: 'ok' }, b: 'x', c: {} }), { a: { comment: 'ok' } });
  assert.deepEqual(sanitizeImportEdits(null), {});
});

test('the repository saves a change to an export transaction, and clearing it restores the export', async () => {
  const storage = memoryStorage({ dataset: { transactions: [exported('a')], meta: {} } });
  const repo = createRepository(storage);
  const { importEdits: edits } = await repo.setImportEdit('a', { kind: 'income', date: '2026-10-11', amount: '25,50', account: 'Carta', category: 'Spesa', comment: 'Supermercato' });
  // The kind stays the export's: only date and amount changed.
  assert.deepEqual(edits, { a: { date: '2026-10-11', amount: 25.5 } });
  assert.deepEqual(storage.blobs.get('import-edits'), edits);
  await assert.rejects(repo.setImportEdit('missing', { amount: 1 }), /non trovato/);
  // Saving the export's values again leaves no change behind.
  assert.deepEqual((await repo.setImportEdit('a', { date: '2026-10-10', amount: 20, account: 'Carta', category: 'Spesa', comment: 'Supermercato' })).importEdits, {});
  await repo.setImportEdit('a', { date: '2026-10-10', amount: 30, account: 'Carta', category: 'Spesa' });
  assert.deepEqual((await repo.clearImportEdit('a')).importEdits, {});
});

test('a balance set after a change counts the changed amount', async () => {
  const storage = memoryStorage({ dataset: { transactions: [exported('a')], meta: {} } });
  const repo = createRepository(storage);
  const { importEdits: edits } = await repo.setImportEdit('a', { date: '2026-10-10', amount: 50, account: 'Carta', category: 'Spesa' });
  const [account] = await repo.addAccount({ name: 'Carta', balance: 100, icon: 'bank', color: '#e0592a' });
  assert.equal(account.exportBase, -50);
  const shown = applyImportEdits([exported('a')], edits);
  assert.equal(accountSummary([account], shown).rows[0].current, 100);
});

test('a change moves the balance of an account set before it had a baseline', async () => {
  // Without exportBase the balance cancels out whatever the export adds up to, changes included.
  const legacy = { id: 'a-1', name: 'Sanpaolo', balance: 300, balanceAt: '2026-11-01T10:00:00.000Z', icon: 'bank', color: '#e0592a', excluded: false };
  const storage = memoryStorage({ dataset: { transactions: [exported('a', { account: 'Sanpaolo', amount: 192 })], meta: {} }, accounts: [legacy] });
  const repo = createRepository(storage);
  const { importEdits, accounts } = await repo.setImportEdit('a', { date: '2026-10-10', amount: '90,75', account: 'Sanpaolo', category: 'Spesa' });
  assert.equal(accounts[0].exportBase, -192);
  const shown = applyImportEdits(storage.blobs.get('dataset').transactions, importEdits);
  assert.equal(accountSummary(accounts, shown).rows[0].current, 401.25);
  // Going back to the export gives the typed balance again.
  const cleared = await repo.clearImportEdit('a');
  assert.equal(accountSummary(cleared.accounts, storage.blobs.get('dataset').transactions).rows[0].current, 300);
});

test('a change saved before the account had a baseline counts once it gets one', async () => {
  const legacy = { id: 'a-1', name: 'Sanpaolo', balance: 300, balanceAt: '2026-11-01T10:00:00.000Z', icon: 'bank', color: '#e0592a', excluded: false };
  const storage = memoryStorage({
    dataset: { transactions: [exported('a', { account: 'Sanpaolo', amount: 192 })], meta: {} },
    accounts: [legacy],
    'import-edits': { a: { amount: 90.75 } },
  });
  const accounts = await createRepository(storage).anchorBeforeEdits();
  const shown = applyImportEdits(storage.blobs.get('dataset').transactions, { a: { amount: 90.75 } });
  assert.equal(accountSummary(accounts, shown).rows[0].current, 401.25);
});
