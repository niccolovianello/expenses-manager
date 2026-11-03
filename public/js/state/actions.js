import { todayISO } from '../lib/dates.js';
import { duplicateKey, entryInput } from '../domain/entries.js';
import { expandRecurrences, recurrenceInput } from '../domain/recurring.js';
import { expandTopUps, settleTopUp } from '../domain/topups.js';
import { inRange } from '../lib/aggregate.js';
import { PRESETS, matchingPreset, presetRange, stepRange, stepUnit } from '../lib/periods.js';
import { navigate } from '../router.js';
import { DEFAULT_TX_FILTERS } from './initial.js';
import { baselineCategory, selectAccountSummary, selectExtent } from './selectors.js';
import { loadAccountSeed, loadRecurringSeed } from '../data/local-seed.js';
import { formatEUR } from '../lib/format.js';
import { showToast } from '../components/toast.js';
import { ruleDraftFrom } from '../domain/categorize.js';

// `api` is the data repository (encrypted on Firebase); `lock` ends the session;
// `markHistory` asks for the next state change to create a history entry.
export function createActions(store, api, { lock, markHistory = () => {} } = {}) {
  // Every manual period change forgets where the zoom started from.
  const setPeriod = (period) => store.set({ period, zoomFrom: null });

  const newestFirst = (a, b) => (b.date + (b.time ?? '')).localeCompare(a.date + (a.time ?? ''));

  // The transactions shown are the imported ones plus the manual ones, the occurrences of the
  // recurring ones and the automatic top-ups up to today. An occurrence the export already contains is
  // shown once, from the export, and moves the balances once, as the imported transaction.
  // The top-ups depend on the balances, so this runs again whenever the accounts change.
  function setData(patch = {}) {
    const { imported, entries, recurrences, topUps, accounts } = { ...store.get(), ...patch };
    const today = todayISO();
    const occurrences = expandRecurrences(recurrences, today);
    const exported = new Set(imported.map(duplicateKey));
    const shown = [...entries, ...occurrences.filter((occurrence) => !exported.has(duplicateKey(occurrence))), ...imported];
    const toppedUp = expandTopUps(topUps, shown, accounts, imported, today);
    store.set({ ...patch, occurrences, transactions: [...shown, ...toppedUp].sort(newestFirst) });
  }

  // Before the history a top-up depends on changes, its amounts so far stay as they are.
  const settlementOf = (topUp) => settleTopUp(topUp, store.get().transactions, todayISO());

  function showData() {
    const { period } = store.get();
    if (period.preset !== 'custom') actions.setPreset(period.preset);
    store.set({ status: 'ready' });
  }

  // Updates the UI immediately, then saves; rolls back if saving fails.
  // `toastAction`: { label, run } offered next to the success message.
  async function persistConfig(optimisticConfig, request, successMessage, toastAction = null) {
    const previous = store.get().config;
    if (optimisticConfig) store.set({ config: optimisticConfig });
    try {
      const config = await request();
      store.set({ config });
      if (successMessage) showToast(successMessage, { action: toastAction });
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
        const [dataset, config, entries, storedRecurrences, stored, topUps] = await Promise.all([
          api.dataset(), api.categorization(), api.entries(), api.recurrences(), api.accounts(), api.topUps(),
        ]);
        const seed = await loadAccountSeed();
        const accounts = seed ? await api.seedAccounts(seed) : stored ?? [];
        // After the accounts: the recurring transactions must use one of them.
        const recurringSeed = await loadRecurringSeed();
        const recurrences = recurringSeed ? await api.seedRecurrences(recurringSeed) : storedRecurrences;
        store.set({ config });
        setData({ imported: dataset?.transactions ?? [], meta: dataset?.meta ?? null, entries, recurrences, accounts, topUps });
        if (dataset || entries.length || recurrences.length || accounts.length) showData();
        else store.set({ status: 'empty' });
      } catch (error) {
        store.set({ status: 'error', error: error.message });
      }
    },

    async importFile(file) {
      if (!file || store.get().importing) return;
      store.set({ importing: true });
      try {
        const { dataset, entries, accounts, removedDuplicates } = await api.importFile(file);
        setData({ imported: dataset.transactions, meta: dataset.meta, entries, accounts });
        showData();
        const duplicates = removedDuplicates === 1
          ? ' · 1 movimento inserito a mano era già nell’export ed è stato tolto'
          : removedDuplicates
            ? ` · ${removedDuplicates} movimenti inseriti a mano erano già nell’export e sono stati tolti`
            : '';
        showToast(`Importati ${dataset.transactions.length} movimenti da ${dataset.meta.fileName}${duplicates}`, { duration: 6000 });
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
      const today = todayISO();
      const { period } = store.get();
      const range = stepRange(period, direction, today);
      if (range) setPeriod({ preset: matchingPreset(range, today, stepUnit(period)) ?? 'custom', ...range });
    },

    // Zooming from a chart remembers the starting period, so one tap can return to it.
    zoomTo(range) {
      const { zoomFrom, period } = store.get();
      markHistory();
      store.set({ granularity: 'auto' });
      actions.setCustomRange(range.from, range.to);
      store.set({ zoomFrom: zoomFrom ?? period });
    },

    undoZoom() {
      const { zoomFrom } = store.get();
      if (zoomFrom) actions.restorePeriod(zoomFrom);
    },

    restorePeriod(period) {
      if (period.preset === 'custom') actions.setCustomRange(period.from, period.to);
      else actions.setPreset(period.preset);
    },

    // State read from the hash (opened address or Back): period and explored category.
    applyLocation(params, route) {
      const { period, focusCategory } = store.get();
      const preset = params.get('p');
      const from = params.get('dal');
      const to = params.get('al');
      const knownPreset = PRESETS.some((candidate) => candidate.id === preset);
      if (knownPreset && preset !== period.preset) actions.setPreset(preset);
      else if (from && to && (period.preset !== 'custom' || from !== period.from || to !== period.to)) actions.setCustomRange(from, to);
      if (route === 'overview' && (preset || from)) {
        const category = params.get('cat');
        if (category !== focusCategory) store.set({ focusCategory: category });
      }
    },

    setGranularity: (granularity) => store.set({ granularity }),
    setAccount: (account) => store.set({ account }),
    setFlow: (flow) => store.set({ flow, focusCategory: null }),
    focusCategory(focusCategory) {
      if (focusCategory) markHistory();
      store.set({ focusCategory });
    },

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

    // `recurring`: the entry is a recurrence, or the new transaction starts as a recurring one.
    // An occurrence of a recurring transaction opens the recurrence it comes from.
    openEntryForm(entry = null, { recurring = false } = {}) {
      if (entry?.origin === 'topup') return actions.openTopUpForm(store.get().topUps.find((t) => t.id === entry.topUpId) ?? null);
      const state = store.get();
      if (state.status === 'empty') showData();
      const occurrence = entry?.origin === 'recurring';
      const source = occurrence ? state.recurrences.find((r) => r.id === entry.recurrenceId) ?? null : entry;
      store.set({ entryDraft: { token: Date.now(), entry: source, recurring: recurring || occurrence } });
      navigate('transactions');
    },

    async saveEntry(id, input) {
      try {
        const entries = id ? await api.updateEntry(id, input) : await api.addEntry(input);
        setData({ entries });
        const outside = !inRange(input, store.get().period) ? ' (fuori dal periodo mostrato)' : '';
        // The new balance of the account, to confirm where the transaction went.
        const account = !id && selectAccountSummary(store.get()).rows.find((row) => row.name === input.account);
        const balance = account ? ` · ${account.name}: ${formatEUR(account.current)}` : '';
        showToast(`${id ? 'Movimento aggiornato' : 'Movimento aggiunto'}${outside}${balance}`);
        return true;
      } catch (error) {
        showToast(error.message, { tone: 'error' });
        return false;
      }
    },

    async deleteEntry(id) {
      try {
        setData({ entries: await api.deleteEntry(id) });
        showToast('Movimento eliminato');
        return true;
      } catch (error) {
        showToast(error.message, { tone: 'error' });
        return false;
      }
    },

    async saveRecurrence(id, input) {
      try {
        const recurrences = id ? await api.updateRecurrence(id, input) : await api.addRecurrence(input);
        setData({ recurrences });
        const future = input.date > todayISO() ? ' (la prima volta in futuro)' : '';
        showToast(`${id ? 'Movimento ricorrente aggiornato' : 'Movimento ricorrente aggiunto'}${future}`);
        return true;
      } catch (error) {
        showToast(error.message, { tone: 'error' });
        return false;
      }
    },

    async deleteRecurrence(id) {
      try {
        setData({ recurrences: await api.deleteRecurrence(id) });
        showToast('Movimento ricorrente eliminato');
        return true;
      } catch (error) {
        showToast(error.message, { tone: 'error' });
        return false;
      }
    },

    // `topUp`: the top-up to edit, or null for a new one.
    openTopUpForm(topUp = null) {
      const state = store.get();
      if (state.status === 'empty') showData();
      store.set({ topUpDraft: { token: Date.now(), topUp } });
      navigate('accounts');
    },

    async saveTopUp(id, input) {
      try {
        const previous = id && store.get().topUps.find((t) => t.id === id);
        const topUps = id ? await api.updateTopUp(id, input, previous ? settlementOf(previous) : {}) : await api.addTopUp(input);
        setData({ topUps });
        const added = !id && topUps.at(-1);
        const now = added && selectAccountSummary(store.get()).rows.find((row) => row.name === added.toAccount);
        const balance = now ? ` · ${now.name}: ${formatEUR(now.current)}` : '';
        showToast(`${id ? 'Ricarica automatica aggiornata' : 'Ricarica automatica aggiunta'}${balance}`);
        return true;
      } catch (error) {
        showToast(error.message, { tone: 'error' });
        return false;
      }
    },

    async deleteTopUp(id) {
      try {
        setData({ topUps: await api.deleteTopUp(id) });
        showToast('Ricarica automatica eliminata');
        return true;
      } catch (error) {
        showToast(error.message, { tone: 'error' });
        return false;
      }
    },

    // A balance typed by hand includes the top-ups so far: they are settled first, so they keep their amount.
    async saveAccount(id, input) {
      try {
        if (id) {
          const state = store.get();
          const name = state.accounts.find((account) => account.id === id)?.name;
          const affected = 'balance' in input ? state.topUps.filter((topUp) => topUp.toAccount === name) : [];
          if (affected.length) await api.settleTopUps(Object.fromEntries(affected.map((topUp) => [topUp.id, settlementOf(topUp)])));
          const { accounts, entries, recurrences, topUps } = await api.updateAccount(id, input);
          setData({ accounts, entries, recurrences, topUps });
        } else {
          setData({ accounts: await api.addAccount(input) });
        }
        if (store.get().status === 'empty') showData();
        showToast(id ? 'Conto aggiornato' : 'Conto aggiunto');
        return true;
      } catch (error) {
        showToast(error.message, { tone: 'error' });
        return false;
      }
    },

    async deleteAccount(id) {
      try {
        setData({ accounts: await api.deleteAccount(id) });
        showToast('Conto eliminato');
        return true;
      } catch (error) {
        showToast(error.message, { tone: 'error' });
        return false;
      }
    },

    // On an occurrence the category changes for the whole recurrence.
    async setCategory(tx, category) {
      if (tx.origin === 'recurring') {
        const recurrence = store.get().recurrences.find((r) => r.id === tx.recurrenceId);
        if (recurrence) await actions.saveRecurrence(recurrence.id, { ...recurrenceInput(recurrence), category });
        return;
      }
      if (tx.origin === 'manual') {
        await actions.saveEntry(tx.id, { ...entryInput(tx), category });
        return;
      }
      const state = store.get();
      const { overrides } = state.config;
      const nextOverrides = { ...overrides };
      const matchesBaseline = category === baselineCategory(state, tx);
      if (matchesBaseline) delete nextOverrides[tx.id];
      else nextOverrides[tx.id] = category;
      if (matchesBaseline && !overrides[tx.id]) return;
      // A correction can become a rule right away, so the next ones are already in the right category.
      await persistConfig(
        { ...state.config, overrides: nextOverrides },
        () => (matchesBaseline ? api.clearOverride(tx.id) : api.setOverride(tx.id, category)),
        matchesBaseline ? 'Categoria ripristinata' : `Spostato in “${category}”`,
        matchesBaseline ? null : { label: 'Crea regola', run: () => actions.draftRule(ruleDraftFrom(tx, category)) },
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
      const index = state.config.rules.findIndex((r) => r.id === rule.id);
      const rules = state.config.rules.filter((r) => r.id !== rule.id);
      return persistConfig({ ...state.config, rules }, () => api.deleteRule(rule.id), 'Regola eliminata', {
        label: 'Annulla',
        run: () => persistConfig(null, () => api.restoreRule(rule, index), 'Regola ripristinata'),
      });
    },

    refreshTheme: () => store.set({ theme: Date.now() }),
  };

  return actions;
}
