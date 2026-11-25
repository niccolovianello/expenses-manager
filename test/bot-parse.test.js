import test from 'node:test';
import assert from 'node:assert/strict';
import { expenseSchema, normalizeParsed, parseTransactions, romeToday, systemPrompt } from '../bot/src/parse.js';
import { buildBotHints } from '../public/js/domain/bot-hints.js';

const hints = {
  v: 1,
  accounts: ['Satispay', 'Conto'],
  defaultAccount: 'Satispay',
  categories: { expense: ['Ristoranti', 'Spesa'], income: ['Stipendio'] },
  tags: ['Lavoro'],
};

const answer = (fields) => ({ status: 'ok', kind: 'expense', amount: 18.5, date: '2026-11-15', account: 'Satispay', toAccount: null, category: 'Ristoranti', tag: null, comment: 'Pizza', question: null, ...fields });

// A stand-in for the Anthropic client: records the request, returns `reply`.
function fakeClient(reply) {
  const requests = [];
  return {
    requests,
    messages: { create: async (request) => { requests.push(request); return reply; } },
  };
}

const reply = (...transactions) => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify({ transactions }) }] });

test('the schema only allows your account and category names, every field required', () => {
  const root = expenseSchema(hints);
  assert.deepEqual(root.required, ['transactions']);
  assert.equal(root.properties.transactions.type, 'array');
  const schema = root.properties.transactions.items;
  assert.deepEqual(schema.properties.account.anyOf[0].enum, ['Satispay', 'Conto']);
  assert.deepEqual(schema.properties.category.anyOf[0].enum, ['Ristoranti', 'Spesa', 'Stipendio']);
  assert.deepEqual(schema.required.sort(), Object.keys(schema.properties).sort());
  assert.equal(schema.additionalProperties, false);
  // No accounts yet: any string, rather than an empty enum the API would reject.
  assert.deepEqual(expenseSchema({ ...hints, accounts: [] }).properties.transactions.items.properties.account.anyOf[0], { type: 'string' });
});

test('the prompt carries today, the default account and the names', () => {
  const prompt = systemPrompt(hints, { today: '2026-11-16', weekday: 'lunedì' });
  assert.match(prompt, /Today is lunedì 2026-11-16/);
  assert.match(prompt, /Default account, for a message that names none: Satispay/);
  assert.match(prompt, /- Ristoranti/);
  assert.match(prompt, /At most 10/);
});

test('today is taken in Italy, not in UTC', () => {
  assert.deepEqual(romeToday(new Date('2026-11-15T23:30:00Z')), { today: '2026-11-16', weekday: 'lunedì' });
});

test('the request uses the chosen model, low effort and the schema', async () => {
  const client = fakeClient(reply({ source: 'pizza 18,50 ieri', ...answer() }));
  const parsed = await parseTransactions({ client, model: 'claude-haiku-5-5', hints, text: 'pizza 18,50 ieri', now: new Date('2026-11-16T10:00:00Z') });
  const [request] = client.requests;
  assert.equal(request.model, 'claude-haiku-5-5');
  assert.equal(request.output_config.effort, 'low');
  assert.equal(request.output_config.format.type, 'json_schema');
  assert.deepEqual(request.messages, [{ role: 'user', content: 'pizza 18,50 ieri' }]);
  assert.deepEqual(parsed, { transactions: [{ source: 'pizza 18,50 ieri', parsed: answer() }], truncated: false });
});

test('a message with several transactions gives one each, in order, and no more than ten', async () => {
  const two = await parseTransactions({
    client: fakeClient(reply({ source: 'pizza 18', ...answer({ amount: 18 }) }, { source: 'benzina', ...answer({ status: 'needs_info', amount: null, category: null, question: 'Quanto?' }) })),
    model: 'm', hints, text: 'pizza 18 e benzina', now: new Date('2026-11-16T10:00:00Z'),
  });
  assert.deepEqual(two.transactions.map(({ source, parsed }) => [source, parsed.status, parsed.amount]), [['pizza 18', 'ok', 18], ['benzina', 'needs_info', null]]);
  assert.equal(two.truncated, false);

  const many = await parseTransactions({ client: fakeClient(reply(...Array.from({ length: 12 }, (_, i) => ({ source: `x ${i}`, ...answer({ amount: i + 1 }) })))), model: 'm', hints, text: 'tante' });
  assert.equal(many.transactions.length, 10);
  assert.equal(many.truncated, true);
});

test('a refusal, a cut-off or a broken answer gives null', async () => {
  for (const reply of [
    { stop_reason: 'refusal', content: [] },
    { stop_reason: 'max_tokens', content: [{ type: 'text', text: '{"status":' }] },
    { stop_reason: 'end_turn', content: [{ type: 'text', text: 'not json' }] },
    { stop_reason: 'end_turn', content: [] },
    { stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(answer()) }] },
  ]) {
    assert.equal(await parseTransactions({ client: fakeClient(reply), model: 'm', hints, text: 'x' }), null);
  }
});

test('names outside the hints are dropped, and a missing amount becomes a question', () => {
  const today = '2026-11-16';
  assert.equal(normalizeParsed(answer({ account: 'Carta inventata' }), hints, today).account, null);
  assert.equal(normalizeParsed(answer({ category: 'Inventata' }), hints, today).category, null);
  assert.equal(normalizeParsed(answer({ date: 'ieri' }), hints, today).date, today);
  assert.equal(normalizeParsed(answer({ amount: 18.499 }), hints, today).amount, 18.5);
  assert.deepEqual(normalizeParsed(answer({ kind: 'transfer', toAccount: 'Conto', category: 'Spesa' }), hints, today).category, null);
  const noAmount = normalizeParsed(answer({ amount: null }), hints, today);
  assert.equal(noAmount.status, 'needs_info');
  assert.equal(noAmount.question, 'Quanto hai speso?');
  assert.equal(normalizeParsed(answer({ question: 'stray' }), hints, today).question, null);
});

test('the app tells the bot names only, with the account used most lately as default', () => {
  const accounts = [{ name: 'Conto', balance: 900 }, { name: 'Satispay', balance: 12 }];
  const entries = [
    { kind: 'expense', date: '2026-11-10', account: 'Satispay', amount: 5 },
    { kind: 'expense', date: '2026-11-12', account: 'Satispay', amount: 7 },
    { kind: 'expense', date: '2026-11-13', account: 'Conto', amount: 9 },
    { kind: 'expense', date: '2025-01-01', account: 'Conto', amount: 1 },
    { kind: 'expense', date: '2025-01-02', account: 'Conto', amount: 1 },
  ];
  const built = buildBotHints({ accounts, entries, categories: { expense: ['Spesa'], income: [] }, tags: ['a', 'b'], today: '2026-11-16' });
  assert.deepEqual(built, { v: 1, accounts: ['Conto', 'Satispay'], defaultAccount: 'Satispay', categories: { expense: ['Spesa'], income: [] }, tags: ['a', 'b'] });
  assert.doesNotMatch(JSON.stringify(built), /900|balance|amount/);
  assert.equal(buildBotHints({ accounts, entries: [], categories: { expense: [], income: [] }, tags: [], today: '2026-11-16' }).defaultAccount, 'Conto');
});
