// What the Telegram bot is told about your data, so Claude picks real account and category names.
// Only names: no amounts, balances or transactions. Stored in plain text (see TELEGRAM-BOT.md).

const MAX_TAGS = 60;
const DEFAULT_ACCOUNT_DAYS = 90;

// The account most used for expenses entered by hand lately: the one a message without an account
// most likely means. Without any, the first account.
function defaultAccountOf(accounts, entries, today) {
  const names = new Set(accounts.map((account) => account.name));
  const since = new Date(Date.parse(`${today}T00:00:00Z`) - DEFAULT_ACCOUNT_DAYS * 86_400_000).toISOString().slice(0, 10);
  const counts = new Map();
  for (const entry of entries) {
    if (entry.kind !== 'expense' || entry.date < since || !names.has(entry.account)) continue;
    counts.set(entry.account, (counts.get(entry.account) ?? 0) + 1);
  }
  const [best] = [...counts].sort((a, b) => b[1] - a[1]);
  return best?.[0] ?? accounts[0]?.name ?? null;
}

// `categories`: { expense: [...], income: [...] } as selectCategories gives them; `tags` most used first.
export function buildBotHints({ accounts, entries, categories, tags, today }) {
  return {
    v: 1,
    accounts: accounts.map((account) => account.name),
    defaultAccount: defaultAccountOf(accounts, entries, today),
    categories: { expense: [...categories.expense], income: [...categories.income] },
    tags: tags.slice(0, MAX_TAGS),
  };
}
