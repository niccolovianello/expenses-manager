import { cleanText, parseAmount } from './entries.js';

// Accounts with a balance typed by hand. The balance is the truth at the moment it was set
// (`balanceAt`): manual transactions entered after that moment and occurrences of recurring ones
// happened after it move it; earlier ones are already part of it. The export has no times, so for
// imported transactions the account remembers what they added up to when the balance was set
// (`exportBase`): whatever the export adds or takes away since then moves the balance.
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

const isEntered = (entry) => entry.origin === 'manual' || entry.origin === 'recurring';
const countsFor = (account, entry) => isEntered(entry) && entry.createdAt > account.balanceAt;

function effectOn(name, entries, include = () => true) {
  let sum = 0;
  for (const entry of entries) {
    if (!include(entry)) continue;
    for (const [account, amount] of entryEffects(entry)) if (account === name) sum += amount;
  }
  return round2(sum);
}

export const movementsSince = (account, entries) => effectOn(account.name, entries, (entry) => countsFor(account, entry));

// What the imported transactions add up to for an account.
export const exportEffect = (name, imported) => effectOn(name, imported);

// The local day a balance was set.
const localDay = (iso) => {
  const date = new Date(iso);
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
};

// A balance set before `exportBase` existed includes the export stored now, until the next import.
const baseOf = (account, imported) => account.exportBase ?? exportEffect(account.name, imported);

// Current balance of every account, and the total of those not excluded from it.
// `transactions` are all the transactions shown: manual, occurrences and imported.
export function accountSummary(accounts, transactions) {
  const entered = transactions.filter(isEntered);
  const imported = transactions.filter((tx) => !isEntered(tx));
  const rows = accounts.map((account) => ({
    ...account,
    current: round2(account.balance + movementsSince(account, entered) + exportEffect(account.name, imported) - baseOf(account, imported)),
  }));
  const total = round2(rows.reduce((sum, row) => (row.excluded ? sum : sum + row.current), 0));
  return { rows, total };
}

// Gives `exportBase` to the accounts without one: what `imported` adds up to, or, with `setDay`,
// only its transactions dated before the day the balance was set (with no earlier export to go by).
export const anchorExport = (accounts, imported, { setDay = false } = {}) => accounts.map((account) => {
  if (account.exportBase != null) return account;
  const include = setDay ? (tx) => tx.date < localDay(account.balanceAt) : undefined;
  return { ...account, exportBase: effectOn(account.name, imported, include) };
});

// Transactions about to disappear (e.g. because the export now contains them) keep their effect on the balance;
// their `copies` in the export take their place without moving it a second time.
export function foldEntries(accounts, removed, copies = []) {
  return accounts.map((account) => {
    const moved = movementsSince(account, removed);
    const copied = exportEffect(account.name, copies);
    if (!moved && !copied) return account;
    return {
      ...account,
      balance: round2(account.balance + moved),
      ...(account.exportBase == null ? {} : { exportBase: round2(account.exportBase + copied) }),
    };
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
