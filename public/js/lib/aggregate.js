import { bucketStart } from './periods.js';

export const inRange = (tx, range) => tx.date >= range.from && tx.date <= range.to;

export function filterScope(transactions, { range, account }) {
  return transactions.filter((tx) =>
    inRange(tx, range) && (account === 'all' || tx.account === account || tx.toAccount === account));
}

export function totals(transactions) {
  const result = { expense: 0, income: 0, transfer: 0, count: transactions.length };
  for (const tx of transactions) result[tx.kind] += tx.amount;
  result.net = result.income - result.expense;
  return result;
}

export function groupTotals(transactions, keyOf) {
  const groups = new Map();
  for (const tx of transactions) {
    const key = keyOf(tx);
    const group = groups.get(key) ?? { key, total: 0, count: 0 };
    group.total += tx.amount;
    group.count += 1;
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) => b.total - a.total);
}

// Sum per time interval: Map(series → array aligned to the buckets).
export function timeSeries(transactions, buckets, granularity, keyOf) {
  const position = new Map(buckets.map((bucket, index) => [bucket.key, index]));
  const series = new Map();
  for (const tx of transactions) {
    const index = position.get(bucketStart(tx.date, granularity));
    if (index === undefined) continue;
    const key = keyOf(tx);
    if (!series.has(key)) series.set(key, new Array(buckets.length).fill(0));
    series.get(key)[index] += tx.amount;
  }
  return series;
}

export const relativeChange = (current, previous) => (previous > 0 ? (current - previous) / previous : null);

export const describeTransaction = (tx) =>
  tx.comment || tx.tag || (tx.kind === 'transfer' ? 'Giroconto' : tx.category) || 'Senza descrizione';

export const signedAmount = (tx) => (tx.kind === 'expense' ? -tx.amount : tx.kind === 'income' ? tx.amount : 0);
