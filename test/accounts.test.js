import test from 'node:test';
import assert from 'node:assert/strict';
import { accountSummary, foldEntries, normalizeAccount } from '../public/js/domain/accounts.js';
import { createRepository } from '../public/js/data/repository.js';

function memoryStorage(initial = {}) {
  const blobs = new Map(Object.entries(initial));
  return { blobs, read: async (name) => structuredClone(blobs.get(name) ?? null), write: async (name, value) => { blobs.set(name, structuredClone(value)); } };
}

// Timestamps decide which transactions count: steps in the test must not share a millisecond.
const tick = () => new Promise((resolve) => setTimeout(resolve, 5));

const account = (name, balance, extra = {}) => ({ id: `a-${name}`, name, balance, balanceAt: '2026-11-01T10:00:00.000Z', icon: 'bank', color: '#e0592a', excluded: false, ...extra });
const manual = (kind, amount, accountName, createdAt, toAccount = null) => ({ id: `m-${createdAt}`, origin: 'manual', kind, amount, account: accountName, toAccount, createdAt });

test('only manual transactions entered after the balance was set move it', () => {
  const accounts = [account('Carta', 100), account('Cash', 20), account('Directa', 5000, { excluded: true })];
  const entries = [
    manual('expense', 30, 'Carta', '2026-10-31T09:00:00.000Z'),
    manual('expense', 12.5, 'Carta', '2026-11-01T11:00:00.000Z'),
    manual('income', 50, 'Carta', '2026-11-01T12:00:00.000Z'),
    manual('transfer', 10, 'Carta', '2026-11-01T13:00:00.000Z', 'Cash'),
    { ...manual('expense', 99, 'Carta', '2026-11-02T00:00:00.000Z'), origin: 'import' },
  ];
  const { rows, total } = accountSummary(accounts, entries);
  assert.deepEqual(rows.map((row) => row.current), [127.5, 30, 5000]);
  assert.equal(total, 157.5);
});

test('removed transactions keep their effect on the balance', () => {
  const removed = [manual('expense', 12.5, 'Carta', '2026-11-01T11:00:00.000Z'), manual('expense', 7, 'Carta', '2026-10-01T11:00:00.000Z')];
  const [carta, cash] = foldEntries([account('Carta', 100), account('Cash', 20)], removed);
  assert.equal(carta.balance, 87.5);
  assert.equal(cash.balance, 20);
});

test('account input is validated', () => {
  assert.match(normalizeAccount({ name: ' ' }).error, /nome/);
  assert.match(normalizeAccount({ name: 'carta' }, [account('Carta', 0)]).error, /già/);
  assert.match(normalizeAccount({ name: 'X', balance: 'abc' }).error, /saldo/);
  assert.equal(normalizeAccount({ name: 'X', balance: '-1.234,50' }).account.balance, -1234.5);
  assert.equal(normalizeAccount({ name: 'X', balance: '' }).account.balance, 0);
  assert.equal('balance' in normalizeAccount({ name: 'X' }).account, false);
});

test('the repository seeds once, ties transactions to accounts and renames them', async () => {
  const storage = memoryStorage({ entries: [] });
  const repo = createRepository(storage);
  assert.equal(await repo.accounts(), null);
  let accounts = await repo.seedAccounts([{ name: 'Carta', balance: 100, icon: 'card' }, { name: 'Cash', balance: 20 }]);
  assert.equal(accounts.length, 2);
  assert.equal((await repo.seedAccounts([{ name: 'Altro' }])).length, 2);

  const expense = { kind: 'expense', date: '2026-11-02', amount: '12,50', account: 'Carta', category: 'Svago' };
  await assert.rejects(() => repo.addEntry({ ...expense, account: 'Sconosciuto' }), /elenco/);
  await tick();
  let entries = await repo.addEntry(expense);
  assert.equal(accountSummary(accounts, entries).rows[0].current, 87.5);

  // A new balance becomes the starting point: earlier transactions no longer count.
  await tick();
  ({ accounts, entries } = await repo.updateAccount(accounts[0].id, { name: 'Carta', icon: 'card', color: '#e0592a', balance: '90' }));
  assert.equal(accountSummary(accounts, entries).rows[0].current, 90);

  // Renaming without a balance keeps it and moves the transactions to the new name.
  await tick();
  entries = await repo.addEntry({ ...expense, amount: '10' });
  ({ accounts, entries } = await repo.updateAccount(accounts[0].id, { name: 'Revolut', icon: 'card', color: '#e0592a' }));
  assert.ok(entries.every((entry) => entry.account === 'Revolut'));
  assert.equal(accountSummary(accounts, entries).rows[0].current, 80);
  assert.deepEqual(storage.blobs.get('accounts'), accounts);
});
