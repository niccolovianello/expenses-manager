import { todayISO } from '../lib/dates.js';
import { presetRange, shiftRange } from '../lib/periods.js';
import { navigate } from '../router.js';
import { DEFAULT_TX_FILTERS } from './initial.js';
import { baselineCategory, selectExtent } from './selectors.js';
import { showToast } from '../components/toast.js';

// `api` è il repository dei dati (cifrati su Firebase); `lock` chiude la sessione.
export function createActions(store, api, { lock } = {}) {
  const setPeriod = (period) => store.set({ period });

  function applyDataset(dataset) {
    store.set({ transactions: dataset.transactions, meta: dataset.meta });
    const { period } = store.get();
    if (period.preset !== 'custom') actions.setPreset(period.preset);
    store.set({ status: 'ready' });
  }

  // Aggiorna subito l'interfaccia, poi salva; se il salvataggio fallisce ripristina.
  async function persistConfig(optimisticConfig, request, successMessage) {
    const previous = store.get().config;
    if (optimisticConfig) store.set({ config: optimisticConfig });
    try {
      const config = await request();
      store.set({ config });
      if (successMessage) showToast(successMessage);
      return true;
    } catch (error) {
      store.set({ config: previous });
      showToast(error.message, { tone: 'error' });
      return false;
    }
  }

  const actions = {
    async load() {
      store.set({ status: 'loading', error: null });
      try {
        const [dataset, config] = await Promise.all([api.dataset(), api.categorization()]);
        store.set({ config });
        if (dataset) applyDataset(dataset);
        else store.set({ status: 'empty' });
      } catch (error) {
        store.set({ status: 'error', error: error.message });
      }
    },

    async importFile(file) {
      if (!file || store.get().importing) return;
      store.set({ importing: true });
      try {
        const dataset = await api.importFile(file);
        applyDataset(dataset);
        showToast(`Importati ${dataset.transactions.length} movimenti da ${dataset.meta.fileName}`);
      } catch (error) {
        showToast(error.message, { tone: 'error' });
      } finally {
        store.set({ importing: false });
      }
    },

    lock: () => lock?.(),

    setPreset(preset) {
      setPeriod({ preset, ...presetRange(preset, todayISO(), selectExtent(store.get())) });
    },

    setCustomRange(from, to) {
      if (!from || !to) return;
      setPeriod(from <= to ? { preset: 'custom', from, to } : { preset: 'custom', from: to, to: from });
    },

    stepPeriod(direction) {
      const { period } = store.get();
      setPeriod({ preset: 'custom', ...shiftRange(period, direction) });
    },

    zoomTo(range) {
      store.set({ granularity: 'auto' });
      actions.setCustomRange(range.from, range.to);
    },

    setGranularity: (granularity) => store.set({ granularity }),
    setAccount: (account) => store.set({ account }),
    setFlow: (flow) => store.set({ flow, focusCategory: null }),
    focusCategory: (focusCategory) => store.set({ focusCategory }),

    setTxFilters(patch) {
      store.set((state) => ({ txFilters: { ...state.txFilters, limit: DEFAULT_TX_FILTERS.limit, ...patch } }));
    },

    showMoreTransactions() {
      store.set((state) => ({ txFilters: { ...state.txFilters, limit: state.txFilters.limit + DEFAULT_TX_FILTERS.limit } }));
    },

    showTransactions(filters) {
      store.set({ txFilters: { ...DEFAULT_TX_FILTERS, ...filters } });
      navigate('transactions');
    },

    async setCategory(tx, category) {
      const state = store.get();
      const { overrides } = state.config;
      const nextOverrides = { ...overrides };
      const matchesBaseline = category === baselineCategory(state, tx);
      if (matchesBaseline) delete nextOverrides[tx.id];
      else nextOverrides[tx.id] = category;
      if (matchesBaseline && !overrides[tx.id]) return;
      await persistConfig(
        { ...state.config, overrides: nextOverrides },
        () => (matchesBaseline ? api.clearOverride(tx.id) : api.setOverride(tx.id, category)),
        matchesBaseline ? 'Categoria ripristinata' : `Spostato in “${category}”`,
      );
    },

    async resetCategory(tx) {
      const state = store.get();
      const overrides = { ...state.config.overrides };
      delete overrides[tx.id];
      await persistConfig({ ...state.config, overrides }, () => api.clearOverride(tx.id), 'Categoria ripristinata');
    },

    draftRule(draft) {
      store.set({ ruleDraft: { ...draft, token: Date.now() } });
      navigate('rules');
    },

    saveRule(draft) {
      const { id, token, ...rule } = draft;
      return persistConfig(
        null,
        () => (id ? api.updateRule(id, rule) : api.addRule(rule)),
        id ? 'Regola aggiornata' : 'Regola aggiunta',
      );
    },

    toggleRule(rule) {
      const state = store.get();
      const rules = state.config.rules.map((r) => (r.id === rule.id ? { ...r, enabled: !r.enabled } : r));
      const { id, ...body } = rule;
      return persistConfig(
        { ...state.config, rules },
        () => api.updateRule(id, { ...body, enabled: !rule.enabled }),
        rule.enabled ? 'Regola sospesa' : 'Regola attivata',
      );
    },

    moveRule(rule, direction) {
      return persistConfig(null, () => api.moveRule(rule.id, direction));
    },

    deleteRule(rule) {
      const state = store.get();
      const rules = state.config.rules.filter((r) => r.id !== rule.id);
      return persistConfig({ ...state.config, rules }, () => api.deleteRule(rule.id), 'Regola eliminata');
    },

    refreshTheme: () => store.set({ theme: Date.now() }),
  };

  return actions;
}
