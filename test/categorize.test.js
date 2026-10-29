import test from 'node:test';
import assert from 'node:assert/strict';
import { categorize, normalizeRule, ruleMatches, UNCATEGORIZED } from '../public/js/domain/categorize.js';

const expense = { id: 'a1', kind: 'expense', sourceCategory: 'Casa', comment: 'Fibra casa (internet)', tag: null, account: 'Conto principale' };
const rule = { id: 'r1', kind: 'expense', field: 'comment', operator: 'contains', value: 'fibra', category: 'Telefono', enabled: true };

test('la categoria dell’export è il valore di partenza', () => {
  assert.deepEqual(categorize(expense, {}), { category: 'Casa', source: 'origin', ruleId: null });
});

test('la prima regola attiva che corrisponde vince, senza distinzione di maiuscole', () => {
  const result = categorize(expense, { rules: [rule, { ...rule, id: 'r2', category: 'Altro' }] });
  assert.equal(result.category, 'Telefono');
  assert.equal(result.ruleId, 'r1');
});

test('le regole sospese o di un altro tipo non si applicano', () => {
  assert.equal(categorize(expense, { rules: [{ ...rule, enabled: false }] }).category, 'Casa');
  assert.equal(ruleMatches({ ...rule, kind: 'income' }, expense), false);
});

test('la correzione manuale ha la precedenza sulle regole', () => {
  const result = categorize(expense, { rules: [rule], overrides: { a1: 'Svago' } });
  assert.deepEqual(result, { category: 'Svago', source: 'manual', ruleId: null });
});

test('i giroconti non hanno categoria e i movimenti senza categoria sono segnalati', () => {
  assert.equal(categorize({ id: 't', kind: 'transfer' }, { rules: [rule] }).category, null);
  assert.equal(categorize({ ...expense, sourceCategory: null }, {}).category, UNCATEGORIZED);
});

test('il campo "qualsiasi testo" cerca in commento, tag e conto', () => {
  assert.equal(ruleMatches({ ...rule, field: 'any', value: 'principale' }, expense), true);
});

test('normalizeRule rifiuta input incompleti', () => {
  assert.match(normalizeRule({ ...rule, value: '  ' }).error, /testo/);
  assert.match(normalizeRule({ ...rule, category: '' }).error, /categoria/);
  assert.equal(normalizeRule({ ...rule, field: 'x' }).error !== undefined, true);
});
