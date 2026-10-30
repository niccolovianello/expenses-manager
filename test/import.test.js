import test from 'node:test';
import assert from 'node:assert/strict';
import { excelSerialToDateTime, extractTransactions } from '../public/js/import/transactions.js';
import { decodeXml, readWorkbook } from '../public/js/import/workbook.js';
import { existsSync, readFileSync } from 'node:fs';

const SAMPLE = new URL('../data/movimenti.xlsx', import.meta.url);

const header = ['Data e ora', 'Categoria', 'Conto', 'Importo in valuta predefinita', 'Valuta predefinita', 'Importo in valuta del conto', 'Valuta conto', 'Importo in valuta della transazione', 'Valuta transazione', 'Tag', 'Commento'];

test('Excel serial dates become ISO dates', () => {
  assert.deepEqual(excelSerialToDateTime(46324), { date: '2026-10-29', time: null });
  assert.deepEqual(excelSerialToDateTime(46324.5), { date: '2026-10-29', time: '12:00' });
});

test('XML entities are decoded', () => {
  assert.equal(decodeXml('L&apos;ondra &amp; &#233;'), "L'ondra & é");
});

test('known sheets become transactions with stable, unique ids', async () => {
  const row = [46324, 'Svago', 'Carta', 42, 'EUR', 42, 'EUR', '', '', '', 'Cena'];
  const workbook = {
    sheets: [
      { name: 'Spese', rows: [['elenco spese'], header, row, row, [null, null]] },
      { name: 'Bonifici', rows: [['elenco bonifici'], ['Data e ora', 'In uscita', 'In entrata', 'Importo nella valuta in uscita', 'Valuta in uscita', 'Importo nella valuta in entrata', 'Valuta in entrata', 'Commento'], [46323, 'Carta', 'Portafoglio', 7, 'EUR', '', '', '']] },
      { name: 'Altro foglio', rows: [header] },
    ],
  };
  const first = (await extractTransactions(workbook)).transactions;
  const second = (await extractTransactions(workbook)).transactions;
  assert.equal(first.length, 3);
  assert.deepEqual(first.map((tx) => tx.id), second.map((tx) => tx.id));
  assert.equal(new Set(first.map((tx) => tx.id)).size, 3);
  const transfer = first.find((tx) => tx.kind === 'transfer');
  assert.equal(transfer.toAccount, 'Portafoglio');
  assert.equal(transfer.sourceCategory, null);
});

test('a missing required column produces a clear error', async () => {
  const workbook = { sheets: [{ name: 'Spese', rows: [['Data e ora', 'Categoria', 'Tag'], [46324, 'Svago', null]] }] };
  await assert.rejects(() => extractTransactions(workbook), /colonna "Conto"/);
});

test('the real xlsx file is read in the expected format', { skip: !existsSync(SAMPLE) && 'local export missing' }, async () => {
  const { transactions } = await extractTransactions(await readWorkbook(new Uint8Array(readFileSync(SAMPLE))));
  assert.ok(transactions.length > 100);
  assert.deepEqual(new Set(transactions.map((tx) => tx.kind)), new Set(['expense', 'income', 'transfer']));
});
