import { importExport } from '../import/index.js';
import { duplicateKey, normalizeEntry } from '../domain/entries.js';
import { emptyCategorization, mutations, sanitizeCategorization } from './categorization-store.js';

const DATASET = 'dataset';
const CATEGORIZATION = 'categorization';
const ENTRIES = 'entries';

// Accesso ai dati dell'app sopra un archivio cifrato con read(name) / write(name, value).
// Tre contenitori: l'ultimo export importato, i movimenti inseriti a mano, regole e correzioni.
export function createRepository(storage) {
  let categorization = null;
  let entries = null;
  let queue = Promise.resolve();

  async function loadCategorization() {
    if (!categorization) categorization = sanitizeCategorization(await storage.read(CATEGORIZATION) ?? emptyCategorization());
    return categorization;
  }

  async function loadEntries() {
    if (!entries) entries = (await storage.read(ENTRIES)) ?? [];
    return entries;
  }

  // Una scrittura alla volta: ogni modifica parte dallo stato salvato dalla precedente.
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

  function validEntry(input) {
    const { entry, error } = normalizeEntry(input);
    if (error) throw new Error(error);
    return entry;
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

    // I movimenti inseriti a mano che ora compaiono anche nell'export vengono tolti, per non contarli due volte.
    async importFile(file) {
      const dataset = await importExport(file);
      await storage.write(DATASET, dataset);
      const imported = new Set(dataset.transactions.map(duplicateKey));
      const isDuplicate = (entry) => imported.has(duplicateKey(entry));
      const current = await loadEntries();
      const removedDuplicates = current.filter(isDuplicate).length;
      const remaining = removedDuplicates
        ? await mutateEntries((list) => list.filter((entry) => !isDuplicate(entry)))
        : current;
      return { dataset, entries: remaining, removedDuplicates };
    },

    async addEntry(input) {
      const entry = validEntry(input);
      const now = new Date().toISOString();
      return mutateEntries((list) => [...list, { id: `m-${crypto.randomUUID()}`, origin: 'manual', createdAt: now, ...entry }]);
    },

    async updateEntry(id, input) {
      const entry = validEntry(input);
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

    setOverride: (id, category) => mutateCategorization('setOverride', id, category),
    clearOverride: (id) => mutateCategorization('clearOverride', id),
    addRule: (rule) => mutateCategorization('addRule', rule),
    updateRule: (id, rule) => mutateCategorization('updateRule', id, rule),
    deleteRule: (id) => mutateCategorization('deleteRule', id),
    moveRule: (id, direction) => mutateCategorization('moveRule', id, direction),
  };
}
