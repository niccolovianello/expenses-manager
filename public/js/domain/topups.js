import { addDays } from '../lib/dates.js';
import { cleanText, isValidDate, parseAmount } from './entries.js';
import { FREQUENCIES, occurrenceDate, occurrenceDates } from './recurring.js';
import { accountSummary, entryEffects, round2 } from './accounts.js';

// Automatic top-ups: on every occurrence (same schedule as a recurring transaction) a transfer
// from a helper account (`account`) brings the topped-up account (`toAccount`) back to `target`,
// e.g. Satispay to 50 € every Monday from the current account. Each one is computed from the
// balance at the start of its day, and never stored: an import that adds earlier movements changes it.
// When the history it depends on is about to change (a new balance typed for the account, a change
// to the rule), the ones up to that day are written down in `settled` and stay as they were.
const EARLIEST = '2000-01-01';
const MAX_TARGET = 1_000_000;

// On error, `field` says which field to fix.
export function normalizeTopUp(input = {}) {
  const toAccount = cleanText(input.toAccount, 60);
  if (!toAccount) return { error: 'Indica il conto da ricaricare', field: 'toAccount' };
  const account = cleanText(input.account, 60);
  if (!account) return { error: 'Indica il conto da cui prendere i soldi', field: 'account' };
  if (account === toAccount) return { error: 'I due conti devono essere diversi', field: 'account' };

  const target = round2(parseAmount(input.target));
  if (!Number.isFinite(target) || target <= 0) return { error: 'Inserisci una cifra maggiore di zero', field: 'target' };
  if (target >= MAX_TARGET) return { error: 'Cifra troppo alta', field: 'target' };

  if (!(input.frequency in FREQUENCIES)) return { error: 'Scegli ogni quanto ricaricare', field: 'frequency' };
  if (!isValidDate(input.date)) return { error: 'Inserisci una data valida', field: 'date' };
  if (input.date < EARLIEST) return { error: 'La data di inizio è troppo lontana', field: 'date' };
  const endDate = input.endDate || null;
  if (endDate && !isValidDate(endDate)) return { error: 'Inserisci una data di fine valida', field: 'endDate' };
  if (endDate && endDate < input.date) return { error: 'La data di fine viene prima di quella di inizio', field: 'endDate' };

  return { topUp: { account, toAccount, target, frequency: input.frequency, date: input.date, endDate } };
}

// Values to show in the form when editing a top-up.
export const topUpInput = (topUp) => ({
  toAccount: topUp.toAccount,
  account: topUp.account,
  target: topUp.target,
  frequency: topUp.frequency,
  date: topUp.date,
  endDate: topUp.endDate,
});

// The first top-up after `today`, or null when the rule has ended.
export function nextTopUp(topUp, today) {
  for (let n = 0; ; n++) {
    const date = occurrenceDate(topUp.date, topUp.frequency, n);
    if (topUp.endDate && date > topUp.endDate) return null;
    if (date > today) return date;
  }
}

const transfer = (topUp, { date, amount, account = topUp.account, toAccount = topUp.toAccount }) => ({
  id: `${topUp.id}@${date}`,
  origin: 'topup',
  topUpId: topUp.id,
  kind: 'transfer',
  date,
  time: null,
  amount,
  currency: 'EUR',
  account,
  toAccount,
  sourceCategory: null,
  tag: null,
  comment: `Ricarica di ${toAccount}`,
  // It moves the balances from the start of its day, or from when the rule was created if later.
  createdAt: maxMoment(`${date}T00:00:00.000Z`, topUp.createdAt),
});

const maxMoment = (a, b) => (a > b ? a : b);

// What the balance of `account` was at the start of `date`: the current one, minus what happened from that day on.
function balanceBefore(account, date, transactions) {
  let balance = accountSummary([account], transactions).rows[0].current;
  for (const tx of transactions) {
    if (tx.date < date) continue;
    for (const [name, amount] of entryEffects(tx)) if (name === account.name) balance -= amount;
  }
  return round2(balance);
}

// The top-ups up to `today`, as transfers. `transactions`: all the others shown (manual, recurring,
// imported). A day on which the export already has a transfer between the two accounts is left to the export.
export function expandTopUps(topUps, transactions, accounts, imported, today) {
  const exported = new Set(imported.filter((tx) => tx.kind === 'transfer').map((tx) => `${tx.date}|${tx.account}|${tx.toAccount}`));
  const shown = [...transactions];
  const added = [];
  for (const topUp of topUps) {
    const account = accounts.find((candidate) => candidate.name === topUp.toAccount);
    const inExport = (date) => exported.has(`${date}|${topUp.account}|${topUp.toAccount}`);
    // Only from the day the rule was created (the balances typed by hand already include what came
    // before) and after the settled ones.
    const created = topUp.createdAt.slice(0, 10);
    const from = topUp.settledUntil ? maxMoment(created, addDays(topUp.settledUntil, 1)) : created;
    const dates = account ? occurrenceDates(topUp, today).filter((date) => date >= from) : [];
    for (const tx of (topUp.settled ?? []).map((settled) => transfer(topUp, settled))) {
      if (inExport(tx.date)) continue;
      shown.push(tx);
      added.push(tx);
    }
    for (const date of dates) {
      if (inExport(date)) continue;
      const amount = round2(topUp.target - balanceBefore(account, date, shown));
      if (amount <= 0) continue;
      const tx = transfer(topUp, { date, amount });
      shown.push(tx);
      added.push(tx);
    }
  }
  return added;
}

// The amounts of a rule's top-ups up to `today`, to keep as they are (see the top of the file).
// Each one keeps its accounts, in case the rule later moves to other ones.
export function settleTopUp(topUp, shown, today) {
  const settled = shown
    .filter((tx) => tx.topUpId === topUp.id && tx.date <= today)
    .map(({ date, amount, account, toAccount }) => ({ date, amount, account, toAccount }))
    .sort((a, b) => a.date.localeCompare(b.date));
  return { settled, settledUntil: today };
}

// A renamed account, also in the settled top-ups.
export function renameTopUp(topUp, { from, to }) {
  const rename = (item) => ({ ...item, account: item.account === from ? to : item.account, toAccount: item.toAccount === from ? to : item.toAccount });
  return { ...rename(topUp), ...(topUp.settled ? { settled: topUp.settled.map(rename) } : {}) };
}
