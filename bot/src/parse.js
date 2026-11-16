// Turns a message like "pizza 18,50 ieri satispay" into the fields of a transaction, with Claude.
// The Anthropic client is passed in, so this module has no dependencies and runs in the tests too.
// The schema lists your real account and category names (the hints the app writes), so the answer
// can only name those.

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_TEXT = 500;

const nullable = (schema) => ({ anyOf: [schema, { type: 'null' }] });
const oneOf = (values) => (values.length ? { type: 'string', enum: values } : { type: 'string' });

export function expenseSchema(hints) {
  const categories = [...new Set([...hints.categories.expense, ...hints.categories.income])];
  return {
    type: 'object',
    properties: {
      status: { type: 'string', enum: ['ok', 'needs_info'] },
      kind: { type: 'string', enum: ['expense', 'income', 'transfer'] },
      amount: nullable({ type: 'number' }),
      date: nullable({ type: 'string', description: 'YYYY-MM-DD' }),
      account: nullable(oneOf(hints.accounts)),
      toAccount: nullable(oneOf(hints.accounts)),
      category: nullable(oneOf(categories)),
      tag: nullable({ type: 'string' }),
      comment: nullable({ type: 'string' }),
      question: nullable({ type: 'string' }),
    },
    required: ['status', 'kind', 'amount', 'date', 'account', 'toAccount', 'category', 'tag', 'comment', 'question'],
    additionalProperties: false,
  };
}

const list = (values) => (values.length ? values.map((value) => `- ${value}`).join('\n') : '(none)');

export function systemPrompt(hints, { today, weekday }) {
  return `You read short messages, usually in Italian, in which one person records a transaction for their personal expense tracker, and you return its fields.

Today is ${weekday} ${today} (Europe/Rome).

Accounts:
${list(hints.accounts)}
Default account, for a message that names none: ${hints.defaultAccount ?? '(none)'}

Expense categories:
${list(hints.categories.expense)}

Income categories:
${list(hints.categories.income)}

Tags already in use:
${list(hints.tags ?? [])}

How to read a message:
- kind: "expense" for money spent (the usual case); "income" for money received (stipendio, rimborso, "mi hanno dato", "ricevuto"); "transfer" for money moved between two of the accounts above (giroconto, "sposto", "ricarico Satispay dal conto"). For a transfer, account is where the money leaves and toAccount where it arrives.
- amount: a positive number in euros. Italian writing: "18,50" is 18.5, "1.200" is 1200, "12 euro" and "12€" are 12.
- date: YYYY-MM-DD. Without a date it is today. "ieri" is yesterday, "l'altro ieri" two days ago, a weekday name ("venerdì") is the most recent one before today. Never a future date unless the message says so.
- account: the account the message names, matched loosely ("satis" is Satispay, "carta" can match a card account). If it names none, the default account. If it names one that is not in the list, null.
- category: required for expenses and income. Choose the most plausible one for the kind from the lists above, even when it is a guess. null for transfers.
- tag: only when one of the tags already in use clearly fits; otherwise null.
- comment: a short description in Italian, starting with a capital letter, without the amount, account or date ("Pizza", "Benzina", "Cena con amici"). null if there is nothing beyond those.
- toAccount: null unless kind is "transfer".
- status: "needs_info" only when the amount is missing or the message is not a transaction at all; then question is one short question in Italian asking for what is missing, and the other fields hold what you could read. Otherwise status is "ok" and question is null.`;
}

// Today and its weekday in Italy, where the messages are written.
export function romeToday(now = new Date()) {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome' }).format(now);
  const weekday = new Intl.DateTimeFormat('it-IT', { timeZone: 'Europe/Rome', weekday: 'long' }).format(now);
  return { today, weekday };
}

// The answer, with anything not in the hints dropped rather than trusted.
export function normalizeParsed(raw, hints, today) {
  const accounts = new Set(hints.accounts);
  const categories = new Set([...hints.categories.expense, ...hints.categories.income]);
  const text = (value, max) => (typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null);
  const kind = ['expense', 'income', 'transfer'].includes(raw.kind) ? raw.kind : 'expense';
  const amount = typeof raw.amount === 'number' && Number.isFinite(raw.amount) && raw.amount > 0 ? Math.round(raw.amount * 100) / 100 : null;
  const parsed = {
    status: raw.status === 'needs_info' ? 'needs_info' : 'ok',
    kind,
    amount,
    date: ISO_DATE.test(raw.date ?? '') ? raw.date : today,
    account: accounts.has(raw.account) ? raw.account : null,
    toAccount: kind === 'transfer' && accounts.has(raw.toAccount) ? raw.toAccount : null,
    category: kind !== 'transfer' && categories.has(raw.category) ? raw.category : null,
    tag: text(raw.tag, 60),
    comment: text(raw.comment, 200),
    question: text(raw.question, 300),
  };
  if (parsed.status === 'ok' && amount === null) {
    parsed.status = 'needs_info';
    parsed.question = 'Quanto hai speso?';
  }
  if (parsed.status === 'needs_info' && !parsed.question) parsed.question = 'Mi manca qualcosa: puoi riscriverlo con importo e cosa hai comprato?';
  if (parsed.status === 'ok') parsed.question = null;
  return parsed;
}

// null when Claude declined, was cut off, or did not return the schema: the bot then asks to rewrite.
export async function parseExpense({ client, model, hints, text, now = new Date() }) {
  const day = romeToday(now);
  const response = await client.messages.create({
    model,
    max_tokens: 2048,
    output_config: { effort: 'low', format: { type: 'json_schema', schema: expenseSchema(hints) } },
    system: systemPrompt(hints, day),
    messages: [{ role: 'user', content: text.slice(0, MAX_TEXT) }],
  });
  if (response.stop_reason !== 'end_turn') return null;
  const block = response.content.find((item) => item.type === 'text');
  if (!block) return null;
  try {
    return normalizeParsed(JSON.parse(block.text), hints, day.today);
  } catch {
    return null;
  }
}
