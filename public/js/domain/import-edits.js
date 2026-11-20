// Changes made by hand to transactions of the export. They are kept apart from the export, by the
// transaction's id: the id depends only on the transaction's content in the export (see
// import/transactions.js), so a change stays attached after every new import of the same transaction.
// The kind cannot change, and the category is changed through the overrides, like from the list.
export const EDITABLE_FIELDS = ['date', 'amount', 'account', 'toAccount', 'tag', 'comment'];

// The fields of `entry` (a normalized entry) that differ from the export's `original`.
export function importEditPatch(original, entry) {
  const patch = {};
  for (const field of EDITABLE_FIELDS) {
    if ((entry[field] ?? null) !== (original[field] ?? null)) patch[field] = entry[field] ?? null;
  }
  return patch;
}

// Keeps only the editable fields with a plausible value (data saved by older versions or edited by hand).
export function sanitizeImportEdits(data) {
  const edits = {};
  if (!data || typeof data !== 'object') return edits;
  for (const [id, patch] of Object.entries(data)) {
    if (!patch || typeof patch !== 'object') continue;
    const clean = {};
    for (const field of EDITABLE_FIELDS) {
      if (!(field in patch)) continue;
      const value = patch[field];
      if (field === 'amount' ? Number.isFinite(value) && value > 0 : value === null || typeof value === 'string') clean[field] = value;
    }
    if (Object.keys(clean).length) edits[id] = clean;
  }
  return edits;
}

// The export's transactions with the changes applied. A changed one is marked `edited` and keeps
// the export's values in `original`.
export function applyImportEdits(transactions, edits = {}) {
  if (!Object.keys(edits).length) return transactions;
  return transactions.map((tx) => {
    const patch = edits[tx.id];
    if (!patch) return tx;
    const original = Object.fromEntries(EDITABLE_FIELDS.map((field) => [field, tx[field] ?? null]));
    return { ...tx, ...patch, edited: true, original };
  });
}
