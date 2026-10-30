import { applyCategorization, categorize } from '../domain/categorize.js';
import { memo } from '../lib/memo.js';
import { comparisonRange, enumerateBuckets, resolveGranularity } from '../lib/periods.js';
import { describeTransaction, filterScope, totals } from '../lib/aggregate.js';
import { buildColorMap } from '../charts/palette.js';

const categorizedOf = memo(applyCategorization);
export const selectCategorized = (state) => categorizedOf(state.transactions, state.config);

const extentOf = memo((transactions) => {
  if (!transactions.length) return null;
  let from = transactions[0].date;
  let to = from;
  for (const tx of transactions) {
    if (tx.date < from) from = tx.date;
    if (tx.date > to) to = tx.date;
  }
  return { from, to };
});
export const selectExtent = (state) => extentOf(state.transactions);

const accountsOf = memo((transactions) => {
  const accounts = new Set();
  for (const tx of transactions) {
    accounts.add(tx.account);
    if (tx.toAccount) accounts.add(tx.toAccount);
  }
  return [...accounts].sort((a, b) => a.localeCompare(b, 'it'));
});
export const selectAccounts = (state) => accountsOf(state.transactions);

const categoriesOf = memo((categorized, rules) => {
  const byKind = { expense: new Set(), income: new Set() };
  for (const tx of categorized) {
    if (!byKind[tx.kind]) continue;
    byKind[tx.kind].add(tx.category);
    if (tx.sourceCategory) byKind[tx.kind].add(tx.sourceCategory);
  }
  for (const rule of rules) byKind[rule.kind]?.add(rule.category);
  const sorted = (set) => [...set].sort((a, b) => a.localeCompare(b, 'it'));
  return { expense: sorted(byKind.expense), income: sorted(byKind.income) };
});
export const selectCategories = (state) => categoriesOf(selectCategorized(state), state.config.rules);

const colorMapsOf = memo((categorized) => ({
  expense: buildColorMap(categorized, 'expense'),
  income: buildColorMap(categorized, 'income'),
}));
export const selectColorMaps = (state) => colorMapsOf(selectCategorized(state));

// The category the transaction would have without the manual override.
export const baselineCategory = (state, tx) => categorize(tx, { rules: state.config.rules, overrides: {} }).category;

const overviewOf = memo((categorized, period, granularityChoice, account, flow, focus) => {
  const range = { from: period.from, to: period.to };
  const compare = comparisonRange(period);
  const current = filterScope(categorized, { range, account });
  const previous = compare ? filterScope(categorized, { range: compare, account }) : [];
  const granularity = resolveGranularity(granularityChoice, range);
  const inFlow = (tx) => tx.kind === flow && (!focus || tx.category === focus);
  return {
    range,
    compare,
    granularity,
    buckets: enumerateBuckets(range, granularity),
    current,
    totals: totals(current),
    previousTotals: compare ? totals(previous) : null,
    flowTransactions: current.filter(inFlow),
    previousFlowTransactions: previous.filter(inFlow),
  };
});

export const selectOverview = (state) =>
  overviewOf(selectCategorized(state), state.period, state.granularity, state.account, state.flow, state.focusCategory);

const SORTERS = {
  date: (a, b) => (a.date + (a.time ?? '')).localeCompare(b.date + (b.time ?? '')),
  amount: (a, b) => a.amount - b.amount,
  description: (a, b) => describeTransaction(a).localeCompare(describeTransaction(b), 'it'),
  category: (a, b) => (a.category ?? '').localeCompare(b.category ?? '', 'it'),
  account: (a, b) => a.account.localeCompare(b.account, 'it'),
};

const searchText = (tx) =>
  [tx.comment, tx.tag, tx.category, tx.sourceCategory, tx.account, tx.toAccount, tx.amount.toFixed(2).replace('.', ',')]
    .filter(Boolean).join(' ').toLocaleLowerCase('it');

const transactionRowsOf = memo((categorized, period, account, filters) => {
  let rows = filterScope(categorized, { range: period, account });
  if (filters.kind !== 'all') rows = rows.filter((tx) => tx.kind === filters.kind);
  if (filters.category !== 'all') rows = rows.filter((tx) => tx.category === filters.category);
  if (filters.onlyEdited) rows = rows.filter((tx) => tx.source === 'manual' || tx.source === 'rule');
  const query = filters.query.trim().toLocaleLowerCase('it');
  if (query) rows = rows.filter((tx) => searchText(tx).includes(query));
  const sorter = SORTERS[filters.sort.key] ?? SORTERS.date;
  const direction = filters.sort.dir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => direction * sorter(a, b) || SORTERS.date(b, a));
});

export const selectTransactionRows = (state) =>
  transactionRowsOf(selectCategorized(state), state.period, state.account, state.txFilters);
