// CSV export of the transactions. The file is meant for a spreadsheet opened in Italian:
// `;` between fields, a decimal comma, and a byte order mark so Excel reads it as UTF-8.

export const DEFAULT_EXPORT_FILTERS = { from: '', to: '', kind: 'all', accounts: null };

const KIND_LABELS = { expense: 'Uscita', income: 'Entrata', transfer: 'Giroconto' };
const ORIGIN_LABELS = { manual: 'Manuale', recurring: 'Ricorrente', topup: 'Ricarica automatica' };

const COLUMNS = [
  ['Data', (tx) => tx.date],
  ['Ora', (tx) => tx.time ?? ''],
  ['Tipo', (tx) => KIND_LABELS[tx.kind] ?? tx.kind],
  ['Importo', (tx) => tx.amount.toFixed(2).replace('.', ',')],
  ['Conto', (tx) => tx.account],
  ['Al conto', (tx) => tx.toAccount ?? ''],
  ['Categoria', (tx) => (tx.kind === 'transfer' ? '' : tx.category ?? '')],
  ['Categoria originale', (tx) => (tx.kind === 'transfer' ? '' : tx.sourceCategory ?? '')],
  ['Tag', (tx) => tx.tag ?? ''],
  ['Descrizione', (tx) => tx.comment ?? ''],
  ['Origine', (tx) => ORIGIN_LABELS[tx.origin] ?? 'Export'],
];

// Empty `from` / `to` leave that side open; `accounts` null means every account.
// A transfer is included when either of its accounts is selected.
export function exportRows(transactions, { from = '', to = '', kind = 'all', accounts = null } = {}) {
  const selected = accounts ? new Set(accounts) : null;
  return transactions
    .filter((tx) => (!from || tx.date >= from)
      && (!to || tx.date <= to)
      && (kind === 'all' || tx.kind === kind)
      && (!selected || selected.has(tx.account) || (tx.toAccount && selected.has(tx.toAccount))))
    .sort((a, b) => (a.date + (a.time ?? '')).localeCompare(b.date + (b.time ?? '')));
}

const quote = (value) => {
  const text = String(value ?? '');
  return /[";\r\n]/.test(text) || /^\s|\s$/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

export function toCSV(transactions) {
  const lines = [COLUMNS.map(([title]) => title), ...transactions.map((tx) => COLUMNS.map(([, value]) => value(tx)))];
  return `﻿${lines.map((cells) => cells.map(quote).join(';')).join('\r\n')}\r\n`;
}

export function exportFileName({ from = '', to = '' } = {}) {
  if (!from && !to) return 'movimenti.csv';
  return `movimenti_${from || 'inizio'}_${to || 'oggi'}.csv`;
}
