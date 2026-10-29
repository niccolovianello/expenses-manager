import { importExport } from '../import/index.js';
import { emptyCategorization, mutations, sanitizeCategorization } from './categorization-store.js';

const DATASET = 'dataset';
const CATEGORIZATION = 'categorization';

// Accesso ai dati dell'app sopra un archivio cifrato con read(name) / write(name, value).
// Espone la stessa interfaccia per tutte le viste: le azioni non sanno dove finiscono i dati.
export function createRepository(storage) {
  let categorization = null;
  let queue = Promise.resolve();

  async function loadCategorization() {
    if (!categorization) categorization = sanitizeCategorization(await storage.read(CATEGORIZATION) ?? emptyCategorization());
    return categorization;
  }

  // Una scrittura alla volta: ogni modifica parte dallo stato salvato dalla precedente.
  function mutate(name, ...args) {
    const run = queue.then(async () => {
      const next = structuredClone(await loadCategorization());
      mutations[name](next, ...args);
      await storage.write(CATEGORIZATION, next);
      categorization = next;
      return next;
    });
    queue = run.catch(() => {});
    return run;
  }

  return {
    dataset: () => storage.read(DATASET),
    categorization: loadCategorization,

    async importFile(file) {
      const dataset = await importExport(file);
      await storage.write(DATASET, dataset);
      return dataset;
    },

    setOverride: (id, category) => mutate('setOverride', id, category),
    clearOverride: (id) => mutate('clearOverride', id),
    addRule: (rule) => mutate('addRule', rule),
    updateRule: (id, rule) => mutate('updateRule', id, rule),
    deleteRule: (id) => mutate('deleteRule', id),
    moveRule: (id, direction) => mutate('moveRule', id, direction),
  };
}
