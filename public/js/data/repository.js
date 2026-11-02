import { importExport } from '../import/index.js';
import { duplicateKey, normalizeEntry } from '../domain/entries.js';
import { foldEntries, normalizeAccount } from '../domain/accounts.js';
import { emptyCategorization, mutations, sanitizeCategorization } from './categorization-store.js';

const DATASET = 'dataset';
const CATEGORIZATION = 'categorization';
const ENTRIES = 'entries';
const ACCOUNTS = 'accounts';

// Access to the app's data on top of an encrypted store with read(name) / write(name, value).
// Four containers: the last imported export, manually entered transactions, rules and overrides, accounts.
export function createRepository(storage) {
  let categorization = null;
  let entries = null;
  // undefined: not read yet; null: accounts never set up.
  let accounts;
  let queue = Promise.resolve();

  async function loadCategorization() {
    if (!categorization) categorization = sanitizeCategorization(await storage.read(CATEGORIZATION) ?? emptyCategorization());
    return categorization;
  }

  async function loadEntries() {
    if (!entries) entries = (await storage.read(ENTRIES)) ?? [];
    return entries;
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

  const writeAccounts = async (next) => {
    await storage.write(ACCOUNTS, next);
    accounts = next;
    return next;
  };

  const mutateAccounts = (change) => serial(async () => writeAccounts(change(structuredClone((await loadAccounts()) ?? []))));

  // Once accounts exist, every transaction has to use one of them (`previous`: the values before an edit, still accepted).
  async function validEntry(input, previous = null) {
    const { entry, error } = normalizeEntry(input);
    if (error) throw new Error(error);
    const names = new Set(((await loadAccounts()) ?? []).map((account) => account.name));
    const known = (name, old) => !name || !names.size || names.has(name) || name === old;
    if (!known(entry.account, previous?.account) || !known(entry.toAccount, previous?.toAccount)) {
      throw new Error('Scegli un conto dall’elenco dei conti');
    }
    return entry;
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

  return {
    dataset: () => storage.read(DATASET),
    categorization: loadCategorization,
    entries: loadEntries,
    accounts: loadAccounts,

    // Manual transactions that now also appear in the export are removed, so they are not counted twice.
    async importFile(file) {
      const dataset = await importExport(file);
      await storage.write(DATASET, dataset);
      const imported = new Set(dataset.transactions.map(duplicateKey));
      const isDuplicate = (entry) => imported.has(duplicateKey(entry));
      const current = await loadEntries();
      const duplicates = current.filter(isDuplicate);
      if (!duplicates.length) return { dataset, entries: current, accounts: (await loadAccounts()) ?? [], removedDuplicates: 0 };
      // The balances already include those transactions: removing them must not move the balances back.
      const nextAccounts = await mutateAccounts((list) => foldEntries(list, duplicates));
      const remaining = await mutateEntries((list) => list.filter((entry) => !isDuplicate(entry)));
      return { dataset, entries: remaining, accounts: nextAccounts, removedDuplicates: duplicates.length };
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

    // First start: the accounts are created only if they were never set up.
    seedAccounts: (inputs) => serial(async () => {
      if ((await loadAccounts()) !== null) return accounts;
      const now = new Date().toISOString();
      const list = [];
      for (const input of inputs) list.push({ id: `a-${crypto.randomUUID()}`, balance: 0, ...validAccount(input, list), balanceAt: now });
      return writeAccounts(list);
    }),

    addAccount: (input) => mutateAccounts((list) => [
      ...list,
      { id: `a-${crypto.randomUUID()}`, balance: 0, ...validAccount(input, list), balanceAt: new Date().toISOString() },
    ]),

    // A new balance becomes the truth from now on. A new name also moves the manual transactions
    // that used the old one, so their effect on the balance is kept.
    async updateAccount(id, input) {
      let renamed = null;
      const nextAccounts = await mutateAccounts((list) => {
        const index = accountIndex(list, id);
        const previous = list[index];
        const account = validAccount(input, list, id);
        if (account.name !== previous.name) renamed = { from: previous.name, to: account.name };
        list[index] = { ...previous, ...account, ...('balance' in account ? { balanceAt: new Date().toISOString() } : {}) };
        return list;
      });
      const nextEntries = renamed
        ? await mutateEntries((list) => list.map((entry) => ({
          ...entry,
          account: entry.account === renamed.from ? renamed.to : entry.account,
          toAccount: entry.toAccount === renamed.from ? renamed.to : entry.toAccount,
        })))
        : await loadEntries();
      return { accounts: nextAccounts, entries: nextEntries };
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
    moveRule: (id, direction) => mutateCategorization('moveRule', id, direction),
  };
}
