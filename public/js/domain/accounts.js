import { cleanText, parseAmount } from './entries.js';

// Accounts with a balance typed by hand. The balance is the truth at the moment it was set
// (`balanceAt`): manual transactions entered after that moment, and occurrences of recurring ones
// happened after it, move it; earlier ones are already part of it.
export const ACCOUNT_ICONS = {
  bank: 'Banca',
  card: 'Carta',
  wallet: 'Portafoglio',
  phone: 'App di pagamento',
  cash: 'Contanti',
  coins: 'Monete',
  piggy: 'Salvadanaio',
  savings: 'Risparmio',
  invest: 'Investimenti',
  euro: 'Euro',
  dollar: 'Liquidità',
  ticket: 'Buoni pasto',
  gift: 'Gift card',
  people: 'Spese condivise',
};

// Stored as the hex value (the data does not change); shown through the --account-N tokens,
// which tokens.css steps for the dark scheme. The names are what a screen reader announces.
export const ACCOUNT_COLORS = [
  '#e0592a', '#f0904a', '#ec6a56', '#e5484d', '#d67aa4', '#8e5bd0',
  '#2337c6', '#2a5aa8', '#2f8f83', '#5aa84f', '#8a9f80', '#b0653a', '#5d4b47', '#6b7079',
];
export const ACCOUNT_COLOR_NAMES = [
  'Arancio', 'Albicocca', 'Corallo', 'Rosso', 'Rosa', 'Viola',
  'Indaco', 'Blu', 'Verde acqua', 'Verde', 'Salvia', 'Terracotta', 'Moka', 'Grigio',
];

// The CSS color of an account: its token, or the stored value for a color outside the palette.
export function accountColor(hex) {
  const index = ACCOUNT_COLORS.indexOf(String(hex).toLowerCase());
  return index === -1 ? hex : `var(--account-${index + 1}, ${hex})`;
}

const MAX_BALANCE = 1_000_000_000;

export const round2 = (value) => Math.round(value * 100) / 100;

// How a transaction moves the balances: [account name, signed amount].
export function entryEffects(entry) {
  if (entry.kind === 'expense') return [[entry.account, -entry.amount]];
  if (entry.kind === 'income') return [[entry.account, entry.amount]];
  if (entry.kind === 'transfer') return [[entry.account, -entry.amount], [entry.toAccount, entry.amount]];
  return [];
}

const countsFor = (account, entry) => (entry.origin === 'manual' || entry.origin === 'recurring') && entry.createdAt > account.balanceAt;

export function movementsSince(account, entries) {
  let sum = 0;
  for (const entry of entries) {
    if (!countsFor(account, entry)) continue;
    for (const [name, amount] of entryEffects(entry)) if (name === account.name) sum += amount;
  }
  return round2(sum);
}

// Current balance of every account, and the total of those not excluded from it.
export function accountSummary(accounts, entries, occurrences = []) {
  const movements = [...entries, ...occurrences];
  const rows = accounts.map((account) => ({ ...account, current: round2(account.balance + movementsSince(account, movements)) }));
  const total = round2(rows.reduce((sum, row) => (row.excluded ? sum : sum + row.current), 0));
  return { rows, total };
}

// Transactions about to disappear (e.g. because the export now contains them) keep their effect on the balance.
export function foldEntries(accounts, removed) {
  return accounts.map((account) => {
    const moved = movementsSince(account, removed);
    return moved ? { ...account, balance: round2(account.balance + moved) } : account;
  });
}

// On error, `field` says which field to fix. `others` are the other accounts, for unique names.
export function normalizeAccount(input = {}, others = []) {
  const name = cleanText(input.name, 60);
  if (!name) return { error: 'Dai un nome al conto', field: 'name' };
  const key = name.toLocaleLowerCase('it');
  if (others.some((other) => other.name.toLocaleLowerCase('it') === key)) return { error: 'Esiste già un conto con questo nome', field: 'name' };

  const account = {
    name,
    icon: input.icon in ACCOUNT_ICONS ? input.icon : 'wallet',
    color: /^#[0-9a-f]{6}$/i.test(input.color ?? '') ? input.color.toLowerCase() : ACCOUNT_COLORS[0],
    excluded: Boolean(input.excluded),
  };

  // Without a balance (editing only name or look) the stored one stays as it is.
  if (input.balance === undefined) return { account };
  const balance = String(input.balance).trim() === '' ? 0 : round2(parseAmount(input.balance));
  if (!Number.isFinite(balance)) return { error: 'Inserisci un saldo valido', field: 'balance' };
  if (Math.abs(balance) >= MAX_BALANCE) return { error: 'Saldo troppo alto', field: 'balance' };
  return { account: { ...account, balance } };
}
