import test from 'node:test';
import assert from 'node:assert/strict';
import { exportFileName, exportRows, toCSV } from '../public/js/domain/export.js';

const txs = [
  { id: '1', date: '2026-03-02', kind: 'expense', amount: 12.5, account: 'Carta', category: 'Spesa', comment: 'Pane; "buono"' },
  { id: '2', date: '2026-01-15', kind: 'income', amount: 1000, account: 'Conto', category: 'Stipendio', origin: 'manual' },
  { id: '3', date: '2026-02-10', kind: 'transfer', amount: 50, account: 'Conto', toAccount: 'Satispay', origin: 'topup' },
];

test('with no filters every transaction is exported, oldest first', () => {
  assert.deepEqual(exportRows(txs).map((tx) => tx.id), ['2', '3', '1']);
});

test('the period is inclusive and each side can be left open', () => {
  assert.deepEqual(exportRows(txs, { from: '2026-02-10' }).map((tx) => tx.id), ['3', '1']);
  assert.deepEqual(exportRows(txs, { to: '2026-02-10' }).map((tx) => tx.id), ['2', '3']);
  assert.deepEqual(exportRows(txs, { from: '2026-02-01', to: '2026-02-28' }).map((tx) => tx.id), ['3']);
});

test('accounts match either side of a transfer; kind narrows further', () => {
  assert.deepEqual(exportRows(txs, { accounts: ['Satispay'] }).map((tx) => tx.id), ['3']);
  assert.deepEqual(exportRows(txs, { accounts: ['Conto', 'Carta'] }).map((tx) => tx.id), ['2', '3', '1']);
  assert.deepEqual(exportRows(txs, { accounts: [] }), []);
  assert.deepEqual(exportRows(txs, { kind: 'expense' }).map((tx) => tx.id), ['1']);
});

test('the CSV uses semicolons, decimal commas and quotes what needs it', () => {
  const lines = toCSV(exportRows(txs)).replace(/^﻿/, '').trimEnd().split('\r\n');
  assert.equal(lines[0], 'Data;Ora;Tipo;Importo;Conto;Al conto;Categoria;Categoria originale;Tag;Descrizione;Origine');
  assert.equal(lines[1], '2026-01-15;;Entrata;1000,00;Conto;;Stipendio;;;;Manuale');
  assert.equal(lines[2], '2026-02-10;;Giroconto;50,00;Conto;Satispay;;;;;Ricarica automatica');
  assert.equal(lines[3], '2026-03-02;;Uscita;12,50;Carta;;Spesa;;;"Pane; ""buono""";Export');
});

test('file name reflects the period', () => {
  assert.equal(exportFileName({}), 'movimenti.csv');
  assert.equal(exportFileName({ from: '2026-01-01', to: '2026-03-31' }), 'movimenti_2026-01-01_2026-03-31.csv');
  assert.equal(exportFileName({ from: '2026-01-01' }), 'movimenti_2026-01-01_oggi.csv');
});
