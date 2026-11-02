import test from 'node:test';
import assert from 'node:assert/strict';
import { accountSummary, anchorExport, foldEntries, normalizeAccount } from '../public/js/domain/accounts.js';
import { createRepository } from '../public/js/data/repository.js';

function memoryStorage(initial = {}) {
  const blobs = new Map(Object.entries(initial));
  return { blobs, read: async (name) => structuredClone(blobs.get(name) ?? null), write: async (name, value) => { blobs.set(name, structuredClone(value)); } };
}

// Timestamps decide which transactions count: steps in the test must not share a millisecond.
const tick = () => new Promise((resolve) => setTimeout(resolve, 5));

const account = (name, balance, extra = {}) => ({ id: `a-${name}`, name, balance, balanceAt: '2026-11-01T10:00:00.000Z', icon: 'bank', color: '#e0592a', excluded: false, ...extra });
const manual = (kind, amount, accountName, createdAt, toAccount = null) => ({ id: `m-${createdAt}`, origin: 'manual', kind, amount, account: accountName, toAccount, createdAt });

// Imported transactions carry the date of the export, no time and no origin.
const exported = (kind, amount, accountName, date, toAccount = null) => ({ id: `x-${date}-${amount}`, kind, amount, account: accountName, toAccount, date, time: null });

test('the export moves a balance by what it adds or takes away since the balance was set', () => {
  const before = [exported('expense', 30, 'Carta', '2026-10-31'), exported('income', 200, 'Carta', '2026-10-01')];
  const accounts = [account('Carta', 100, { exportBase: 170 }), account('Cash', 20, { exportBase: 0 })];
  assert.equal(accountSummary(accounts, before).rows[0].current, 100);
  // Back-dated, same-day and later transactions all count; one deleted from the export gives its amount back.
  const after = [
    before[1],
    exported('expense', 4, 'Carta', '2026-10-15'),
    exported('expense', 12.5, 'Carta', '2026-11-01'),
    exported('transfer', 10, 'Carta', '2026-11-02', 'Cash'),
  ];
  const { rows, total } = accountSummary(accounts, after);
  assert.deepEqual(rows.map((row) => row.current), [103.5, 30]);
  assert.equal(total, 133.5);
});

test('a balance without a baseline includes the export stored when it gets one', () => {
  // Set at 10:00 local on 1 November: transactions of that day may come after it.
  const balanceAt = new Date('2026-11-01T10:00').toISOString();
  const imported = [exported('expense', 30, 'Carta', '2026-10-31'), exported('expense', 8, 'Carta', '2026-11-01')];
  const accounts = [account('Carta', 100, { balanceAt })];
  assert.equal(accountSummary(accounts, imported).rows[0].current, 100);
  const [anchored] = anchorExport(accounts, imported);
  assert.equal(anchored.exportBase, -38);
  assert.equal(accountSummary([anchored], [...imported, exported('income', 50, 'Carta', '2026-11-02')]).rows[0].current, 150);
  // With no earlier export, the first one counts from the day the balance was set.
  const [first] = anchorExport(accounts, imported, { setDay: true });
  assert.equal(accountSummary([first], imported).rows[0].current, 92);
});

test('removed transactions keep their effect on the balance', () => {
  const removed = [manual('expense', 12.5, 'Carta', '2026-11-01T11:00:00.000Z'), manual('expense', 7, 'Carta', '2026-10-01T11:00:00.000Z')];
  const [carta, cash] = foldEntries([account('Carta', 100), account('Cash', 20)], removed);
  assert.equal(carta.balance, 87.5);
  assert.equal(cash.balance, 20);
});

test('an import does not count twice a manual transaction it also contains', () => {
  // One entered after the balance was set, one before (already part of it).
  const entries = [
    { ...manual('expense', 12.5, 'Carta', '2026-11-01T11:00:00.000Z'), date: '2026-11-01' },
    { ...manual('expense', 7, 'Carta', '2026-10-31T12:00:00.000Z'), date: '2026-10-30' },
  ];
  const copies = [exported('expense', 12.5, 'Carta', '2026-11-01'), exported('expense', 7, 'Carta', '2026-10-30')];
  const accounts = [account('Carta', 100, { exportBase: 0 })];
  const before = accountSummary(accounts, entries).rows[0].current;
  const after = accountSummary(foldEntries(accounts, entries, copies), copies).rows[0].current;
  assert.equal(before, 87.5);
  assert.equal(after, before);
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
  // Later seeds only add what is missing, and never bring back a deleted account.
  assert.equal((await repo.seedAccounts([{ name: 'carta' }, { name: 'Altro', balance: 5 }])).length, 3);
  await repo.deleteAccount((await repo.accounts())[2].id);
  accounts = await repo.seedAccounts([{ name: 'Altro', balance: 5 }]);
  assert.equal(accounts.length, 2);

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

test('a balance set in the repository remembers the export, and keeps it through a rename', async () => {
  const transactions = [exported('expense', 30, 'Carta', '2026-10-31'), exported('transfer', 10, 'Cash', '2026-10-30', 'Carta')];
  const storage = memoryStorage({ entries: [], dataset: { meta: {}, transactions } });
  const repo = createRepository(storage);
  let [carta] = await repo.addAccount({ name: 'Carta', balance: '100' });
  assert.equal(carta.exportBase, -20);
  assert.equal(accountSummary([carta], transactions).rows[0].current, 100);
  // The export still calls it Carta: renaming it here leaves it unmatched, without moving the balance.
  ({ accounts: [carta] } = await repo.updateAccount(carta.id, { name: 'Revolut', icon: 'card', color: '#e0592a' }));
  assert.equal(accountSummary([carta], transactions).rows[0].current, 100);
  ({ accounts: [carta] } = await repo.updateAccount(carta.id, { name: 'Revolut', icon: 'card', color: '#e0592a', balance: '50' }));
  assert.equal(carta.exportBase, 0);
});
