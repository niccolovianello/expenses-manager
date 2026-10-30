import { SHEET_SCHEMA, REQUIRED_COLUMNS } from './schema.js';

// Days between the Excel epoch (1899-12-30) and the Unix epoch.
const EXCEL_EPOCH_OFFSET = 25569;
const DAY_MS = 86_400_000;

export function excelSerialToDateTime(serial) {
  const iso = new Date(Math.round((serial - EXCEL_EPOCH_OFFSET) * DAY_MS)).toISOString();
  return { date: iso.slice(0, 10), time: serial % 1 ? iso.slice(11, 16) : null };
}

const text = (value) => {
  const result = value === null || value === undefined ? '' : String(value).trim();
  return result || null;
};

const isBlankRow = (row) => row.every((value) => value === null || value === '');

function findHeaderRow(rows) {
  return rows.findIndex((row) => row.filter((value) => text(value)).length >= 3);
}

function columnPositions(sheetName, header, columns) {
  const labels = header.map((value) => text(value) ?? '');
  const positions = {};
  for (const [field, label] of Object.entries(columns)) {
    positions[field] = labels.indexOf(label);
    if (positions[field] === -1 && REQUIRED_COLUMNS.includes(field)) {
      throw new Error(`Foglio "${sheetName}": colonna "${label}" non trovata`);
    }
  }
  return positions;
}

function toTransaction(kind, row, positions) {
  const get = (field) => (positions[field] >= 0 ? row[positions[field]] : null);
  const serial = get('date');
  const amount = Number(get('amount'));
  if (typeof serial !== 'number' || !Number.isFinite(amount)) return null;

  const { date, time } = excelSerialToDateTime(serial);
  const isTransfer = kind === 'transfer';
  return {
    kind,
    date,
    time,
    amount: Math.round(Math.abs(amount) * 100) / 100,
    currency: text(get('currency')) ?? 'EUR',
    account: text(get('account')) ?? 'Senza conto',
    toAccount: isTransfer ? text(get('toAccount')) : null,
    sourceCategory: isTransfer ? null : text(get('category')),
    tag: text(get('tag')),
    comment: text(get('comment')),
  };
}

async function sha1Hex(value) {
  const digest = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

// Id stable from one export to the next: it depends only on the transaction's content,
// so rules and manual overrides stay attached after every new import.
async function assignIds(transactions) {
  const occurrences = new Map();
  const fingerprints = await Promise.all(transactions.map((tx) => sha1Hex(
    [tx.kind, tx.date, tx.time, tx.account, tx.toAccount, tx.amount, tx.sourceCategory, tx.tag, tx.comment].join('\u0001'),
  )));
  transactions.forEach((tx, index) => {
    const base = fingerprints[index].slice(0, 12);
    const seen = occurrences.get(base) ?? 0;
    occurrences.set(base, seen + 1);
    tx.id = seen ? `${base}-${seen}` : base;
  });
}

export async function extractTransactions(workbook, schema = SHEET_SCHEMA) {
  const transactions = [];
  let skippedRows = 0;

  for (const sheet of workbook.sheets) {
    const definition = schema[sheet.name];
    if (!definition) continue;
    const headerIndex = findHeaderRow(sheet.rows);
    if (headerIndex === -1) continue;
    const positions = columnPositions(sheet.name, sheet.rows[headerIndex], definition.columns);

    for (const row of sheet.rows.slice(headerIndex + 1)) {
      if (isBlankRow(row)) continue;
      const tx = toTransaction(definition.kind, row, positions);
      if (tx) transactions.push(tx);
      else skippedRows++;
    }
  }

  if (!transactions.length) {
    throw new Error(`Nessun movimento riconosciuto. Fogli attesi: ${Object.keys(schema).join(', ')}`);
  }

  await assignIds(transactions);
  transactions.sort((a, b) => (b.date + (b.time ?? '')).localeCompare(a.date + (a.time ?? '')));
  return { transactions, skippedRows };
}
