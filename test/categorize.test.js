import test from 'node:test';
import assert from 'node:assert/strict';
import { categorize, normalizeRule, ruleDraftFrom, ruleMatches, UNCATEGORIZED } from '../public/js/domain/categorize.js';
import { mutations } from '../public/js/data/categorization-store.js';

const expense = { id: 'a1', kind: 'expense', sourceCategory: 'Casa', comment: 'Fibra casa (internet)', tag: null, account: 'Conto principale' };
const rule = { id: 'r1', kind: 'expense', field: 'comment', operator: 'contains', value: 'fibra', category: 'Telefono', enabled: true };

test('the export category is the starting value', () => {
  assert.deepEqual(categorize(expense, {}), { category: 'Casa', source: 'origin', ruleId: null });
});

test('the first matching active rule wins, case-insensitively', () => {
  const result = categorize(expense, { rules: [rule, { ...rule, id: 'r2', category: 'Altro' }] });
  assert.equal(result.category, 'Telefono');
  assert.equal(result.ruleId, 'r1');
});

test('paused rules or rules for another kind do not apply', () => {
  assert.equal(categorize(expense, { rules: [{ ...rule, enabled: false }] }).category, 'Casa');
  assert.equal(ruleMatches({ ...rule, kind: 'income' }, expense), false);
});

test('a manual override takes precedence over rules', () => {
  const result = categorize(expense, { rules: [rule], overrides: { a1: 'Svago' } });
  assert.deepEqual(result, { category: 'Svago', source: 'manual', ruleId: null });
});

test('transfers have no category and uncategorized transactions are flagged', () => {
  assert.equal(categorize({ id: 't', kind: 'transfer' }, { rules: [rule] }).category, null);
  assert.equal(categorize({ ...expense, sourceCategory: null }, {}).category, UNCATEGORIZED);
});

test('the "any text" field searches comment, tag and account', () => {
  assert.equal(ruleMatches({ ...rule, field: 'any', value: 'principale' }, expense), true);
});

test('normalizeRule rejects incomplete input', () => {
  assert.match(normalizeRule({ ...rule, value: '  ' }).error, /testo/);
  assert.match(normalizeRule({ ...rule, category: '' }).error, /categoria/);
  assert.equal(normalizeRule({ ...rule, field: 'x' }).error !== undefined, true);
});

test('a rule drafted from a transaction targets the merchant, not the whole description', () => {
  const tx = { kind: 'expense', comment: 'Esselunga — spesa settimanale', tag: null, account: 'Carta' };
  assert.deepEqual(ruleDraftFrom(tx), { kind: 'expense', field: 'comment', operator: 'contains', value: 'Esselunga', category: '' });
  assert.equal(ruleDraftFrom({ ...tx, comment: 'Bar centrale, colazione' }, 'Ristoranti').category, 'Ristoranti');
  assert.equal(ruleDraftFrom({ ...tx, comment: 'Benzina Q8' }).value, 'Benzina Q8');
  assert.equal(ruleDraftFrom({ ...tx, comment: null, tag: 'lavoro' }).field, 'tag');
});

test('a deleted rule comes back with its id at its old place', () => {
  const rule = { id: 'b', kind: 'expense', field: 'comment', operator: 'contains', value: 'Netflix', category: 'Svago', enabled: true };
  const state = { rules: [{ ...rule, id: 'a' }, rule, { ...rule, id: 'c' }], overrides: {} };
  mutations.deleteRule(state, 'b');
  mutations.restoreRule(state, rule, 1);
  assert.deepEqual(state.rules.map((r) => r.id), ['a', 'b', 'c']);
  mutations.restoreRule(state, rule, 1);
  assert.equal(state.rules.length, 3);
});
