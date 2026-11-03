import test from 'node:test';
import assert from 'node:assert/strict';
import { expandTopUps, nextTopUp, normalizeTopUp, renameTopUp, settleTopUp } from '../public/js/domain/topups.js';
import { accountSummary } from '../public/js/domain/accounts.js';
import { createRepository } from '../public/js/data/repository.js';

const input = { toAccount: 'Satispay', account: 'Arancio', target: '50', frequency: 'weekly', date: '2026-10-05' };
const rule = { id: 't-1', ...normalizeTopUp(input).topUp, createdAt: '2026-10-01T10:00:00.000Z' };
const accounts = [
  { id: 's', name: 'Satispay', balance: 50, balanceAt: '2026-10-01T09:00:00.000Z' },
  { id: 'a', name: 'Arancio', balance: 1000, balanceAt: '2026-10-01T09:00:00.000Z' },
];
const spend = (date, amount, createdAt = `${date}T12:00:00.000Z`) =>
  ({ id: `m-${date}`, origin: 'manual', kind: 'expense', date, amount, account: 'Satispay', createdAt });

test('top-up input is validated', () => {
  assert.equal(rule.target, 50);
  assert.equal(rule.endDate, null);
  assert.equal(normalizeTopUp({ ...input, account: 'Satispay' }).field, 'account');
  assert.equal(normalizeTopUp({ ...input, target: '0' }).field, 'target');
  assert.equal(normalizeTopUp({ ...input, frequency: 'hourly' }).field, 'frequency');
  assert.equal(normalizeTopUp({ ...input, endDate: '2026-10-01' }).field, 'endDate');
  assert.equal(nextTopUp(rule, '2026-10-12'), '2026-10-19');
});

test('each top-up brings the account back to the target from the balance at the start of its day', () => {
  const entries = [spend('2026-10-06', 30), spend('2026-10-12', 5), spend('2026-10-14', 45)];
  const topUps = expandTopUps([rule], entries, accounts, [], '2026-10-20');
  // 5 Oct: already 50. 12 Oct: 20 left, the expense of that day comes after. 19 Oct: 50 − 5 − 45 = 0.
  assert.deepEqual(topUps.map((t) => [t.date, t.amount]), [['2026-10-12', 30], ['2026-10-19', 50]]);
  assert.deepEqual(topUps.map((t) => t.createdAt), ['2026-10-12T00:00:00.000Z', '2026-10-19T00:00:00.000Z']);
  const { rows } = accountSummary(accounts, [...entries, ...topUps]);
  assert.deepEqual(rows.map((row) => row.current), [50, 920]);
});

test('a day the export already has a transfer for is left to the export, and nothing before the rule was created', () => {
  const imported = [{ id: 'x', kind: 'transfer', date: '2026-10-12', amount: 30, account: 'Arancio', toAccount: 'Satispay' }];
  const early = { ...rule, date: '2026-09-28' };
  const exportedAfter = accounts.map((account) => ({ ...account, exportBase: 0 }));
  const topUps = expandTopUps([early], [spend('2026-10-06', 30), ...imported], exportedAfter, imported, '2026-10-13');
  assert.deepEqual(topUps, []);
});

test('settled top-ups keep their amount and accounts after the balance or the rule changes', () => {
  const entries = [spend('2026-10-06', 30)];
  const shown = expandTopUps([rule], entries, accounts, [], '2026-10-13');
  const settled = { ...rule, ...settleTopUp(rule, shown, '2026-10-13'), target: 80, account: 'Altro' };
  assert.deepEqual(settled.settled, [{ date: '2026-10-12', amount: 30, account: 'Arancio', toAccount: 'Satispay' }]);
  // The balance typed on 13 Oct (50) already includes the top-up of the 12th.
  const typed = [{ ...accounts[0], balanceAt: '2026-10-13T08:00:00.000Z' }, accounts[1], { id: 'o', name: 'Altro', balance: 0, balanceAt: accounts[1].balanceAt }];
  const topUps = expandTopUps([settled], entries, typed, [], '2026-10-19');
  assert.deepEqual(topUps.map((t) => [t.date, t.amount, t.account]), [['2026-10-12', 30, 'Arancio'], ['2026-10-19', 30, 'Altro']]);
  assert.equal(renameTopUp(settled, { from: 'Arancio', to: 'Conto' }).settled[0].account, 'Conto');
});

function memoryStorage(initial = {}) {
  const blobs = new Map(Object.entries(initial));
  return { blobs, read: async (name) => structuredClone(blobs.get(name) ?? null), write: async (name, value) => { blobs.set(name, structuredClone(value)); } };
}

test('the repository adds, settles, renames and deletes top-ups', async () => {
  const storage = memoryStorage({ accounts });
  const repo = createRepository(storage);
  let list = await repo.addTopUp(input);
  assert.match(list[0].id, /^t-/);
  await assert.rejects(() => repo.addTopUp({ ...input, account: 'Altro' }), /conto/);

  list = await repo.updateTopUp(list[0].id, { ...input, target: '60' }, { settled: [], settledUntil: '2026-10-13' });
  assert.equal(list[0].target, 60);
  assert.equal(list[0].settledUntil, '2026-10-13');

  const { topUps } = await repo.updateAccount('a', { name: 'Conto', icon: 'bank', color: '#2337c6' });
  assert.equal(topUps[0].account, 'Conto');
  assert.deepEqual(await repo.deleteTopUp(list[0].id), []);
  assert.deepEqual(storage.blobs.get('topups'), []);
});
