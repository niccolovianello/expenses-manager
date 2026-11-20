import { importExport } from '../import/index.js';
import { duplicateKey, normalizeEntry } from '../domain/entries.js';
import { normalizeRecurrence } from '../domain/recurring.js';
import { normalizeTopUp, renameTopUp } from '../domain/topups.js';
import { anchorExport, exportEffect, foldEntries, normalizeAccount, round2 } from '../domain/accounts.js';
import { applyImportEdits, importEditPatch, sanitizeImportEdits } from '../domain/import-edits.js';
import { emptyCategorization, mutations, sanitizeCategorization } from './categorization-store.js';
import { generateInboxKeys, importInboxPrivateKey, openInboxItem } from '../vault/inbox-crypto.js';

const DATASET = 'dataset';
const CATEGORIZATION = 'categorization';
const ENTRIES = 'entries';
const ACCOUNTS = 'accounts';
const RECURRING = 'recurring';
const TOPUPS = 'topups';
const SEEDED = 'account-seed';
const SEEDED_RECURRING = 'recurring-seed';
const INBOX_KEY = 'inbox-key';
const IMPORT_EDITS = 'import-edits';

// A transaction from the Telegram inbox takes its id from the inbox item: adding it twice (a drain
// interrupted between saving and deleting the item) finds it already there.
export const inboxEntryId = (docId) => `m-tg-${docId}`;

// What the review list shows of an inbox item: the message as written and what was read from it.
const inboxView = (id, payload) => ({
  id,
  text: typeof payload?.text === 'string' ? payload.text : '',
  receivedAt: payload?.receivedAt ?? null,
  parsed: payload?.parsed && typeof payload.parsed === 'object' ? payload.parsed : {},
});

// Access to the app's data on top of an encrypted store with read(name) / write(name, value).
// Seven containers: the last imported export, the changes made to its transactions, manually entered
// transactions, recurring ones, rules and overrides, accounts, automatic top-ups.
export function createRepository(storage) {
  let categorization = null;
  let entries = null;
  let recurrences = null;
  let topUps = null;
  let importEdits = null;
  // undefined: not read yet; null: accounts never set up / nothing imported yet.
  let accounts;
  let dataset;
  // undefined: not read yet; null: Telegram never set up.
  let inboxKey;
  let queue = Promise.resolve();

  async function loadCategorization() {
    if (!categorization) categorization = sanitizeCategorization(await storage.read(CATEGORIZATION) ?? emptyCategorization());
    return categorization;
  }

  async function loadEntries() {
    if (!entries) entries = (await storage.read(ENTRIES)) ?? [];
    return entries;
  }

  async function loadRecurrences() {
    if (!recurrences) recurrences = (await storage.read(RECURRING)) ?? [];
    return recurrences;
  }

  async function loadTopUps() {
    if (!topUps) topUps = (await storage.read(TOPUPS)) ?? [];
    return topUps;
  }

  async function loadDataset() {
    if (dataset === undefined) dataset = await storage.read(DATASET);
    return dataset;
  }

  async function loadImportEdits() {
    if (!importEdits) importEdits = sanitizeImportEdits(await storage.read(IMPORT_EDITS));
    return importEdits;
  }

  // The export's transactions as the app shows them: with the changes made by hand.
  const edited = async (transactions) => applyImportEdits(transactions, await loadImportEdits());

  // A balance set now includes what the export adds up to for the account; without an export, the
  // first import decides (see anchorExport).
  async function withExportBase(account) {
    const current = await loadDataset();
    return { ...account, exportBase: current ? exportEffect(account.name, await edited(current.transactions)) : null };
  }

  async function loadInboxKey() {
    if (inboxKey === undefined) inboxKey = await storage.read(INBOX_KEY);
    return inboxKey;
  }

  // An account without `exportBase` (balance set before it existed) cancels out whatever the export
  // stored now adds up to, so a change to one of its transactions would never move it. Its balance was
  // typed before any change existed: it gets the export as it came as its baseline.
  async function anchorBeforeEdits() {
    const current = await loadDataset();
    const list = (await loadAccounts()) ?? [];
    if (!current || !list.some((account) => account.exportBase == null)) return accounts ?? null;
    return mutateAccounts((next) => anchorExport(next, current.transactions));
  }

  // Only the public half leaves the repository, with the user id the bot writes under.
  const inboxSetupOf = (stored) => (stored ? { publicJwk: stored.publicJwk, ownerUid: storage.uid ?? null, createdAt: stored.createdAt } : null);

  const manualEntry = (id, entry, extra = {}) => ({ id, origin: 'manual', createdAt: new Date().toISOString(), ...extra, ...entry });

  async function loadAccounts() {
    if (accounts === undefined) accounts = await storage.read(ACCOUNTS);
    return accounts;
  }

  // One write at a time: each change starts from the state saved by the previous one.
  function serial(task) {
    const run = queue.then(task);
    queue = run.catch(() => {});
    return run;
  }

  const mutateCategorization = (name, ...args) => serial(async () => {
    const next = structuredClone(await loadCategorization());
    mutations[name](next, ...args);
    await storage.write(CATEGORIZATION, next);
    categorization = next;
    return next;
  });

  const mutateEntries = (change) => serial(async () => {
    const next = change(structuredClone(await loadEntries()));
    await storage.write(ENTRIES, next);
    entries = next;
    return next;
  });

  const mutateRecurrences = (change) => serial(async () => {
    const next = change(structuredClone(await loadRecurrences()));
    await storage.write(RECURRING, next);
    recurrences = next;
    return next;
  });

  const mutateTopUps = (change) => serial(async () => {
    const next = change(structuredClone(await loadTopUps()));
    await storage.write(TOPUPS, next);
    topUps = next;
    return next;
  });

  const writeAccounts = async (next) => {
    await storage.write(ACCOUNTS, next);
    accounts = next;
    return next;
  };

  const mutateAccounts = (change) => serial(async () => writeAccounts(change(structuredClone((await loadAccounts()) ?? []))));

  // Once accounts exist, every transaction has to use one of them (`previous`: the values before an edit, still accepted).
  async function validEntry(input, previous = null, normalize = normalizeEntry) {
    const { entry, recurrence, error } = normalize(input);
    if (error) throw new Error(error);
    const names = new Set(((await loadAccounts()) ?? []).map((account) => account.name));
    const known = (name, old) => !name || !names.size || names.has(name) || name === old;
    const valid = entry ?? recurrence;
    if (!known(valid.account, previous?.account) || !known(valid.toAccount, previous?.toAccount)) {
      throw new Error('Scegli un conto dall’elenco dei conti');
    }
    return valid;
  }

  const validRecurrence = (input, previous = null) => validEntry(input, previous, normalizeRecurrence);

  // Top-ups use the accounts of the Conti section only: one that is not there has no balance to bring back.
  async function validTopUp(input) {
    const { topUp, error } = normalizeTopUp(input);
    if (error) throw new Error(error);
    const names = new Set(((await loadAccounts()) ?? []).map((account) => account.name));
    if (!names.has(topUp.account) || !names.has(topUp.toAccount)) throw new Error('Scegli un conto dall’elenco dei conti');
    return topUp;
  }

  function validAccount(input, list, id = null) {
    const { account, error } = normalizeAccount(input, list.filter((other) => other.id !== id));
    if (error) throw new Error(error);
    return account;
  }

  function accountIndex(list, id) {
    const index = list.findIndex((account) => account.id === id);
    if (index === -1) throw new Error('Conto non trovato');
    return index;
  }

  function entryIndex(list, id) {
    const index = list.findIndex((entry) => entry.id === id);
    if (index === -1) throw new Error('Movimento non trovato');
    return index;
  }

  const renameIn = (list, { from, to }) => list.map((item) => ({
    ...item,
    account: item.account === from ? to : item.account,
    toAccount: item.toAccount === from ? to : item.toAccount,
  }));

  return {
    dataset: loadDataset,
    categorization: loadCategorization,
    entries: loadEntries,
    recurrences: loadRecurrences,
    accounts: loadAccounts,
    topUps: loadTopUps,
    importEdits: loadImportEdits,

    // Manual transactions that now also appear in the export are removed, so they are not counted twice.
    async importFile(file) {
      const next = await importExport(file);
      // Balances without a baseline get one from the previous export before it is gone.
      const previous = await loadDataset();
      const before = previous ? await edited(previous.transactions) : null;
      const after = await edited(next.transactions);
      const anchored = await mutateAccounts((list) =>
        before ? anchorExport(list, before) : anchorExport(list, after, { setDay: true }));
      await storage.write(DATASET, next);
      dataset = next;
      // Matched on the export as it is; the copy that takes the place of a manual one is the one shown.
      const imported = new Map(next.transactions.map((tx, index) => [duplicateKey(tx), after[index]]));
      const isDuplicate = (entry) => imported.has(duplicateKey(entry));
      const current = await loadEntries();
      const duplicates = current.filter(isDuplicate);
      if (!duplicates.length) return { dataset: next, entries: current, accounts: anchored, removedDuplicates: 0 };
      // The balances already include those transactions: removing them must not move the balances back,
      // nor must their copies in the export count a second time.
      const copies = duplicates.map((entry) => imported.get(duplicateKey(entry)));
      const nextAccounts = await mutateAccounts((list) => foldEntries(list, duplicates, copies));
      const remaining = await mutateEntries((list) => list.filter((entry) => !isDuplicate(entry)));
      return { dataset: next, entries: remaining, accounts: nextAccounts, removedDuplicates: duplicates.length };
    },

    async addEntry(input) {
      const entry = await validEntry(input);
      return mutateEntries((list) => [...list, manualEntry(`m-${crypto.randomUUID()}`, entry)]);
    },

    inboxSetup: async () => inboxSetupOf(await loadInboxKey()),

    // A new key pair for the bot. Items sealed with a previous one can no longer be opened.
    createInboxKey: () => serial(async () => {
      const { privateJwk, publicJwk } = await generateInboxKeys();
      const next = { privateJwk, publicJwk, createdAt: new Date().toISOString() };
      await storage.write(INBOX_KEY, next);
      inboxKey = next;
      return inboxSetupOf(next);
    }),

    // Opens what the bot left in the inbox. Valid transactions are added and their items deleted;
    // the others stay in the inbox and come back in `review` (to fix and save, or discard) or in
    // `unreadable` (sealed with another key, or damaged). A `cancel` item takes back an earlier one:
    // the transaction if it was already added, the item if it is still waiting.
    // `entries` is the new list, or null when nothing changed.
    async drainInbox() {
      const result = { entries: null, added: 0, cancelled: 0, review: [], unreadable: [] };
      const stored = await loadInboxKey();
      if (!stored || !storage.inbox) return result;
      const items = await storage.inbox.list();
      if (!items.length) return result;

      const privateKey = await importInboxPrivateKey(stored.privateJwk);
      const opened = [];
      for (const item of items) {
        try {
          opened.push({ id: item.id, payload: await openInboxItem(privateKey, item.id, item) });
        } catch (error) {
          result.unreadable.push({ id: item.id, error: error.message });
        }
      }

      const present = new Set((await loadEntries()).map((entry) => entry.id));
      const waiting = new Set(opened.map((item) => item.id));
      const cancels = opened.filter((item) => item.payload?.type === 'cancel');
      const cancelled = new Set(cancels.map((item) => String(item.payload.ref ?? '')));
      result.cancelled = [...cancelled].filter((ref) => present.has(inboxEntryId(ref)) || waiting.has(ref)).length;

      const done = cancels.map((item) => item.id);
      const additions = [];
      for (const { id, payload } of opened) {
        if (payload?.type === 'cancel') continue;
        // Taken back, or already added by an earlier drain that did not get to delete the item.
        if (cancelled.has(id) || present.has(inboxEntryId(id))) {
          done.push(id);
          continue;
        }
        const view = inboxView(id, payload);
        if (view.parsed.status && view.parsed.status !== 'ok') {
          result.review.push({ ...view, error: view.parsed.question || 'Il messaggio non bastava per un movimento' });
          continue;
        }
        try {
          additions.push(manualEntry(inboxEntryId(id), await validEntry(view.parsed), { via: 'telegram' }));
          done.push(id);
        } catch (error) {
          result.review.push({ ...view, error: error.message });
        }
      }

      // Taken back after it was added: the transaction goes too.
      const removed = new Set([...cancelled].map(inboxEntryId).filter((id) => present.has(id)));
      if (additions.length || removed.size) {
        result.entries = await mutateEntries((list) => [...list.filter((entry) => !removed.has(entry.id)), ...additions]);
      }
      result.added = additions.length;
      // Deleted only once the transactions are saved: if this fails, the next drain finds them added.
      await Promise.all([...new Set(done)].map((id) => storage.inbox.remove(id)));
      return result;
    },

    // An item from the review list, saved with the values corrected in the form.
    async acceptInboxItem(docId, input) {
      const entry = await validEntry(input);
      const id = inboxEntryId(docId);
      const next = await mutateEntries((list) => (list.some((item) => item.id === id) ? list : [...list, manualEntry(id, entry, { via: 'telegram' })]));
      await storage.inbox?.remove(docId);
      return next;
    },

    async discardInboxItem(docId) {
      await storage.inbox?.remove(docId);
    },

    async writeBotHints(hints) {
      await storage.writeBotHints?.(hints);
    },

    async updateEntry(id, input) {
      const previous = (await loadEntries()).find((candidate) => candidate.id === id);
      const entry = await validEntry(input, previous);
      return mutateEntries((list) => {
        const index = entryIndex(list, id);
        list[index] = { ...list[index], ...entry, updatedAt: new Date().toISOString() };
        return list;
      });
    },

    // A change to a transaction of the export: `input` has the values of the form (the kind stays the
    // export's). Only the fields that differ from the export are kept; none left means no change.
    // Returns { importEdits, accounts }.
    async setImportEdit(id, input) {
      const original = (await loadDataset())?.transactions.find((tx) => tx.id === id);
      if (!original) throw new Error('Movimento non trovato nell’export');
      const entry = await validEntry({ ...input, kind: original.kind }, original);
      const patch = importEditPatch(original, entry);
      const nextAccounts = await anchorBeforeEdits();
      const next = await serial(async () => {
        const list = { ...(await loadImportEdits()) };
        if (Object.keys(patch).length) list[id] = patch;
        else delete list[id];
        await storage.write(IMPORT_EDITS, list);
        importEdits = list;
        return list;
      });
      return { importEdits: next, accounts: nextAccounts };
    },

    // Returns { importEdits, accounts }.
    async clearImportEdit(id) {
      const nextAccounts = await anchorBeforeEdits();
      const next = await serial(async () => {
        const list = { ...(await loadImportEdits()) };
        if (!(id in list)) return list;
        delete list[id];
        await storage.write(IMPORT_EDITS, list);
        importEdits = list;
        return list;
      });
      return { importEdits: next, accounts: nextAccounts };
    },

    anchorBeforeEdits: () => anchorBeforeEdits(),

    deleteEntry(id) {
      return mutateEntries((list) => {
        list.splice(entryIndex(list, id), 1);
        return list;
      });
    },

    async addRecurrence(input) {
      const recurrence = await validRecurrence(input);
      const now = new Date().toISOString();
      return mutateRecurrences((list) => [...list, { id: `r-${crypto.randomUUID()}`, createdAt: now, ...recurrence }]);
    },

    async updateRecurrence(id, input) {
      const previous = (await loadRecurrences()).find((candidate) => candidate.id === id);
      const recurrence = await validRecurrence(input, previous);
      return mutateRecurrences((list) => {
        const index = entryIndex(list, id);
        list[index] = { ...list[index], ...recurrence, updatedAt: new Date().toISOString() };
        return list;
      });
    },

    deleteRecurrence(id) {
      return mutateRecurrences((list) => {
        list.splice(entryIndex(list, id), 1);
        return list;
      });
    },

    async addTopUp(input) {
      const topUp = await validTopUp(input);
      return mutateTopUps((list) => [...list, { id: `t-${crypto.randomUUID()}`, createdAt: new Date().toISOString(), ...topUp }]);
    },

    // `settlement` ({ settled, settledUntil }): the top-ups so far, kept as they are (see domain/topups.js).
    async updateTopUp(id, input, settlement = {}) {
      const topUp = await validTopUp(input);
      return mutateTopUps((list) => {
        const index = entryIndex(list, id);
        list[index] = { ...list[index], ...topUp, ...settlement, updatedAt: new Date().toISOString() };
        return list;
      });
    },

    // `settlements`: { [id]: { settled, settledUntil } }.
    settleTopUps: (settlements) => mutateTopUps((list) => list.map((topUp) => ({ ...topUp, ...settlements[topUp.id] }))),

    deleteTopUp(id) {
      return mutateTopUps((list) => {
        list.splice(entryIndex(list, id), 1);
        return list;
      });
    },

    // Adds the initial accounts not there yet, next to the existing ones. Each one is added once:
    // an account deleted later does not come back, one with the same name is left as it is.
    seedAccounts: (inputs) => serial(async () => {
      const list = structuredClone((await loadAccounts()) ?? []);
      const seeded = new Set((await storage.read(SEEDED)) ?? []);
      const taken = new Set(list.map((account) => account.name.toLocaleLowerCase('it')));
      const missing = inputs.filter((input) => !seeded.has(input.name) && !taken.has(input.name.toLocaleLowerCase('it')));
      if (!missing.length) return accounts ?? [];
      const now = new Date().toISOString();
      for (const input of missing) list.push(await withExportBase({ id: `a-${crypto.randomUUID()}`, balance: 0, ...validAccount(input, list), balanceAt: now }));
      const next = await writeAccounts(list);
      await storage.write(SEEDED, [...seeded, ...missing.map((input) => input.name)]);
      return next;
    }),

    // Adds the initial recurring transactions, each one once (by description): one deleted later
    // does not come back, one with the same description is left as it is.
    seedRecurrences: (inputs) => serial(async () => {
      const list = structuredClone(await loadRecurrences());
      const seeded = new Set((await storage.read(SEEDED_RECURRING)) ?? []);
      const key = (text) => (text ?? '').toLocaleLowerCase('it');
      const taken = new Set(list.map((recurrence) => key(recurrence.comment)));
      const missing = inputs.filter((input) => !seeded.has(input.comment) && !taken.has(key(input.comment)));
      if (!missing.length) return list;
      const now = new Date().toISOString();
      for (const input of missing) list.push({ id: `r-${crypto.randomUUID()}`, createdAt: now, ...(await validRecurrence(input)) });
      await storage.write(RECURRING, list);
      recurrences = list;
      await storage.write(SEEDED_RECURRING, [...seeded, ...missing.map((input) => input.comment)]);
      return list;
    }),

    addAccount: (input) => serial(async () => {
      const list = structuredClone((await loadAccounts()) ?? []);
      const account = await withExportBase({ id: `a-${crypto.randomUUID()}`, balance: 0, ...validAccount(input, list), balanceAt: new Date().toISOString() });
      return writeAccounts([...list, account]);
    }),

    // A new balance becomes the truth from now on. A new name also moves the manual and recurring
    // transactions that used the old one, so their effect on the balance is kept; the imported ones keep
    // the name of the export, so the baseline follows the name.
    async updateAccount(id, input) {
      let renamed = null;
      const nextAccounts = await serial(async () => {
        const list = structuredClone((await loadAccounts()) ?? []);
        const index = accountIndex(list, id);
        const current = await loadDataset();
        const imported = await edited(current?.transactions ?? []);
        const [previous] = current ? anchorExport([list[index]], imported) : [list[index]];
        const account = validAccount(input, list, id);
        if (account.name !== previous.name) renamed = { from: previous.name, to: account.name };
        const updated = { ...previous, ...account };
        if ('balance' in account) list[index] = await withExportBase({ ...updated, balanceAt: new Date().toISOString() });
        else if (renamed && previous.exportBase != null) {
          list[index] = { ...updated, exportBase: round2(previous.exportBase - exportEffect(renamed.from, imported) + exportEffect(renamed.to, imported)) };
        } else list[index] = updated;
        return writeAccounts(list);
      });
      const nextEntries = renamed ? await mutateEntries((list) => renameIn(list, renamed)) : await loadEntries();
      const nextRecurrences = renamed ? await mutateRecurrences((list) => renameIn(list, renamed)) : await loadRecurrences();
      const nextTopUps = renamed ? await mutateTopUps((list) => list.map((topUp) => renameTopUp(topUp, renamed))) : await loadTopUps();
      return { accounts: nextAccounts, entries: nextEntries, recurrences: nextRecurrences, topUps: nextTopUps };
    },

    deleteAccount(id) {
      return mutateAccounts((list) => {
        list.splice(accountIndex(list, id), 1);
        return list;
      });
    },

    setOverride: (id, category) => mutateCategorization('setOverride', id, category),
    clearOverride: (id) => mutateCategorization('clearOverride', id),
    addRule: (rule) => mutateCategorization('addRule', rule),
    updateRule: (id, rule) => mutateCategorization('updateRule', id, rule),
    deleteRule: (id) => mutateCategorization('deleteRule', id),
    restoreRule: (rule, index) => mutateCategorization('restoreRule', rule, index),
    moveRule: (id, direction) => mutateCategorization('moveRule', id, direction),
  };
}
