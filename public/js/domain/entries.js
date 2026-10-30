import { normalizeCategory } from './categorize.js';

// Movimenti inseriti a mano dall'interfaccia: stessa forma dei movimenti importati,
// con origin 'manual' e un id proprio che non collide con quelli dell'export.
export const ENTRY_KINDS = { expense: 'Uscita', income: 'Entrata', transfer: 'Giroconto' };

const MAX_AMOUNT = 1_000_000_000;

const clean = (value, maxLength) => {
  const text = String(value ?? '').trim().replace(/\s+/g, ' ');
  return text ? text.slice(0, maxLength) : null;
};

// Accetta "12,50", "1.234,56", "12.5" e numeri.
export function parseAmount(value) {
  if (typeof value === 'number') return value;
  let text = String(value ?? '').replace(/[\s€]/g, '');
  if (text.includes(',')) text = text.replace(/\./g, '').replace(',', '.');
  return text ? Number(text) : NaN;
}

function isValidDate(iso) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso ?? '')) return false;
  const [year, month, day] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function normalizeEntry(input = {}) {
  const { kind } = input;
  if (!(kind in ENTRY_KINDS)) return { error: 'Scegli il tipo di movimento' };
  if (!isValidDate(input.date)) return { error: 'Inserisci una data valida' };

  const amount = Math.round(parseAmount(input.amount) * 100) / 100;
  if (!Number.isFinite(amount) || amount <= 0) return { error: 'Inserisci un importo maggiore di zero' };
  if (amount >= MAX_AMOUNT) return { error: 'Importo troppo alto' };

  const account = clean(input.account, 60);
  if (!account) return { error: kind === 'transfer' ? 'Indica il conto di partenza' : 'Indica il conto' };

  const isTransfer = kind === 'transfer';
  const toAccount = isTransfer ? clean(input.toAccount, 60) : null;
  if (isTransfer && !toAccount) return { error: 'Indica il conto di destinazione' };
  if (isTransfer && toAccount === account) return { error: 'I due conti del giroconto devono essere diversi' };

  const category = isTransfer ? null : normalizeCategory(input.category);
  if (!isTransfer && !category) return { error: 'Scegli o scrivi una categoria' };

  return {
    entry: {
      kind,
      date: input.date,
      time: null,
      amount,
      currency: 'EUR',
      account,
      toAccount,
      sourceCategory: category,
      tag: clean(input.tag, 60),
      comment: clean(input.comment, 200),
    },
  };
}

// Valori da mostrare nel modulo per modificare un movimento esistente.
export const entryInput = (tx) => ({
  kind: tx.kind,
  date: tx.date,
  amount: tx.amount,
  account: tx.account,
  toAccount: tx.toAccount,
  category: tx.sourceCategory,
  tag: tx.tag,
  comment: tx.comment,
});

// Chiave per riconoscere un movimento inserito a mano che poi compare anche nell'export.
export const duplicateKey = (tx) => [tx.kind, tx.date, tx.amount.toFixed(2), tx.account, tx.toAccount ?? ''].join('|');
