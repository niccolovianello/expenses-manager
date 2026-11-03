import { importExport } from '../import/index.js';
import { duplicateKey, normalizeEntry } from '../domain/entries.js';
import { normalizeRecurrence } from '../domain/recurring.js';
import { normalizeTopUp, renameTopUp } from '../domain/topups.js';
import { anchorExport, exportEffect, foldEntries, normalizeAccount, round2 } from '../domain/accounts.js';
import { emptyCategorization, mutations, sanitizeCategorization } from './categorization-store.js';

const DATASET = 'dataset';
const CATEGORIZATION = 'categorization';
const ENTRIES = 'entries';
const ACCOUNTS = 'accounts';
const RECURRING = 'recurring';
const TOPUPS = 'topups';
const SEEDED = 'account-seed';
const SEEDED_RECURRING = 'recurring-seed';

// Access to the app's data on top of an encrypted store with read(name) / write(name, value).
// Six containers: the last imported export, manually entered transactions, recurring ones,
// rules and overrides, accounts, automatic top-ups.
export function createRepository(storage) {
  let categorization = null;
  let entries = null;
  let recurrences = null;
  let topUps = null;
  // undefined: not read yet; null: accounts never set up / nothing imported yet.
  let accounts;
  let dataset;
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

  // A balance set now includes what the export adds up to for the account; without an export, the
  // first import decides (see anchorExport).
  async function withExportBase(account) {
    const current = await loadDataset();
    return { ...account, exportBase: current ? exportEffect(account.name, current.transactions) : null };
  }

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

    // Manual transactions that now also appear in the export are removed, so they are not counted twice.
    async importFile(file) {
      const next = await importExport(file);
      // Balances without a baseline get one from the previous export before it is gone.
      const previous = await loadDataset();
      const anchored = await mutateAccounts((list) =>
        previous ? anchorExport(list, previous.transactions) : anchorExport(list, next.transactions, { setDay: true }));
      await storage.write(DATASET, next);
      dataset = next;
      const imported = new Map(next.transactions.map((tx) => [duplicateKey(tx), tx]));
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
      const now = new Date().toISOString();
      return mutateEntries((list) => [...list, { id: `m-${crypto.randomUUID()}`, origin: 'manual', createdAt: now, ...entry }]);
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
        const imported = current?.transactions ?? [];
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
