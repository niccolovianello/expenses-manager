import { readWorkbook } from './workbook.js';
import { extractTransactions } from './transactions.js';

// From the user's chosen file to the dataset: everything happens in the browser, nothing leaves unencrypted.
export async function importExport(file) {
  if (!/\.xlsx$/i.test(file.name)) throw new Error('Scegli un file .xlsx esportato dall’app di budgeting');
  let extracted;
  try {
    extracted = await extractTransactions(await readWorkbook(new Uint8Array(await file.arrayBuffer())));
  } catch (error) {
    throw new Error(`Impossibile leggere ${file.name}: ${error.message}`);
  }
  return {
    transactions: extracted.transactions,
    meta: { fileName: file.name, updatedAt: new Date().toISOString(), skippedRows: extracted.skippedRows },
  };
}
