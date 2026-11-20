import { todayISO } from '../lib/dates.js';
import { duplicateKey, entryInput } from '../domain/entries.js';
import { expandRecurrences, recurrenceInput } from '../domain/recurring.js';
import { expandTopUps, settleTopUp } from '../domain/topups.js';
import { applyImportEdits } from '../domain/import-edits.js';
import { inRange } from '../lib/aggregate.js';
import { PRESETS, matchingPreset, presetRange, stepRange, stepUnit } from '../lib/periods.js';
import { navigate } from '../router.js';
import { DEFAULT_TX_FILTERS } from './initial.js';
import { baselineCategory, selectAccountSummary, selectCategories, selectExtent, selectTags } from './selectors.js';
import { watch } from './store.js';
import { debounce } from '../lib/memo.js';
import { buildBotHints } from '../domain/bot-hints.js';
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

  // The transactions shown are the imported ones (with the changes made to them by hand) plus the manual
  // ones, the occurrences of the recurring ones and the automatic top-ups up to today. An occurrence the
  // export already contains is shown once, from the export, and moves the balances once, as the imported
  // transaction. The top-ups depend on the balances, so this runs again whenever the accounts change.
  function setData(patch = {}) {
    const { imported, importEdits, entries, recurrences, topUps, accounts } = { ...store.get(), ...patch };
    const today = todayISO();
    const occurrences = expandRecurrences(recurrences, today);
    // Matched on the export as it came, so changing a transaction does not bring its occurrence back.
    const exported = new Set(imported.map(duplicateKey));
    const exportShown = applyImportEdits(imported, importEdits);
    const shown = [...entries, ...occurrences.filter((occurrence) => !exported.has(duplicateKey(occurrence))), ...exportShown];
    const toppedUp = expandTopUps(topUps, shown, accounts, exportShown, today);
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

  // Once Telegram is set up, the names the bot needs follow every change of accounts and categories.
  // Written only when they change, a moment after the last change.
  let hintsSync = null;
  function syncBotHints() {
    if (hintsSync) return;
    let written = null;
    const write = debounce(async (hints, key) => {
      try {
        await api.writeBotHints(hints);
        written = key;
      } catch (error) {
        showToast(`Telegram: ${error.message}`, { tone: 'error' });
      }
    }, 1500);
    hintsSync = watch(store, ['accounts', 'transactions', 'recurrences', 'config', 'status'], (state) => {
      if (state.status !== 'ready' && state.status !== 'empty') return;
      const hints = buildBotHints({
        accounts: state.accounts,
        entries: state.entries,
        categories: selectCategories(state),
        tags: selectTags(state),
        today: todayISO(),
      });
      const key = JSON.stringify(hints);
      if (key !== written) write(hints, key);
    });
  }

  const actions = {
    async load() {
      store.set({ status: 'loading', error: null });
      try {
        const [dataset, config, entries, storedRecurrences, stored, topUps, importEdits] = await Promise.all([
          api.dataset(), api.categorization(), api.entries(), api.recurrences(), api.accounts(), api.topUps(), api.importEdits(),
        ]);
        const seed = await loadAccountSeed();
        const accounts = seed ? await api.seedAccounts(seed) : stored ?? [];
        // After the accounts: the recurring transactions must use one of them.
        const recurringSeed = await loadRecurringSeed();
        const recurrences = recurringSeed ? await api.seedRecurrences(recurringSeed) : storedRecurrences;
        store.set({ config });
        setData({ imported: dataset?.transactions ?? [], importEdits, meta: dataset?.meta ?? null, entries, recurrences, accounts, topUps });
        if (dataset || entries.length || recurrences.length || accounts.length) showData();
        else store.set({ status: 'empty' });
      } catch (error) {
        store.set({ status: 'error', error: error.message });
        return;
      }
      await actions.checkInbox();
    },

    // What the Telegram bot left in the inbox: valid transactions are added, the rest waits in Movimenti.
    async checkInbox() {
      try {
        const inboxSetup = await api.inboxSetup();
        store.set({ inboxSetup });
        if (!inboxSetup) return;
        syncBotHints();
        const { entries, added, cancelled, review, unreadable } = await api.drainInbox();
        store.set({ inboxReview: review, inboxUnreadable: unreadable });
        if (entries) {
          setData({ entries });
          if (store.get().status === 'empty') showData();
        }
        const waiting = review.length + unreadable.length;
        const parts = [
          added && (added === 1 ? '1 movimento aggiunto da Telegram' : `${added} movimenti aggiunti da Telegram`),
          cancelled && (cancelled === 1 ? '1 annullato' : `${cancelled} annullati`),
          waiting && `${waiting} da rivedere`,
        ].filter(Boolean);
        if (!parts.length) return;
        const action = waiting && store.get().route !== 'transactions' ? { label: 'Rivedi', run: () => navigate('transactions') } : null;
        showToast(parts.join(' · '), { duration: 6000, action });
      } catch (error) {
        showToast(`Telegram: ${error.message}`, { tone: 'error' });
      }
    },

    // Creates (or replaces) the key pair the bot seals with, then rereads the inbox with it.
    async setUpTelegram() {
      try {
        const replacing = Boolean(store.get().inboxSetup);
        store.set({ inboxSetup: await api.createInboxKey() });
        await actions.checkInbox();
        // After the inbox toast, if any: what to do next matters more than what is waiting in Movimenti.
        showToast(replacing ? 'Nuova chiave creata: aggiornala nel bot' : 'Chiave creata: copiala nel bot');
        return true;
      } catch (error) {
        showToast(error.message, { tone: 'error' });
        return false;
      }
    },

    // Opens an inbox item in the transaction form, filled with what was read from the message.
    reviewInboxItem(id) {
      const item = store.get().inboxReview.find((candidate) => candidate.id === id);
      if (!item) return;
      store.set({ entryDraft: { token: Date.now(), entry: null, recurring: false, inbox: item } });
      navigate('transactions');
    },

    async acceptInboxItem(id, input) {
      try {
        setData({ entries: await api.acceptInboxItem(id, input) });
        store.set((state) => ({ inboxReview: state.inboxReview.filter((item) => item.id !== id) }));
        const outside = !inRange(input, store.get().period) ? ' (fuori dal periodo mostrato)' : '';
        showToast(`Movimento da Telegram aggiunto${outside}`);
        return true;
      } catch (error) {
        showToast(error.message, { tone: 'error' });
        return false;
      }
    },

    async discardInboxItem(id) {
      try {
        await api.discardInboxItem(id);
        store.set((state) => ({
          inboxReview: state.inboxReview.filter((item) => item.id !== id),
          inboxUnreadable: state.inboxUnreadable.filter((item) => item.id !== id),
        }));
        showToast('Messaggio scartato');
        return true;
      } catch (error) {
        showToast(error.message, { tone: 'error' });
        return false;
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
    // An occurrence of a recurring transaction opens the recurrence it comes from; a transaction of the
    // export opens as it is shown, with its current category.
    openEntryForm(entry = null, { recurring = false } = {}) {
      if (entry?.origin === 'topup') return actions.openTopUpForm(store.get().topUps.find((t) => t.id === entry.topUpId) ?? null);
      const state = store.get();
      if (state.status === 'empty') showData();
      const occurrence = entry?.origin === 'recurring';
      const imported = Boolean(entry) && !entry.origin && !recurring;
      const source = occurrence ? state.recurrences.find((r) => r.id === entry.recurrenceId) ?? null : entry;
      store.set({ entryDraft: { token: Date.now(), entry: source, recurring: recurring || occurrence, imported } });
      navigate('transactions');
    },

    // Saves the changes to a transaction of the export. The category goes, as from the list, into the
    // overrides: compared with what the rules give the transaction as changed (a new description can match another rule).
    async saveImportEdit(tx, input) {
      try {
        setData({ importEdits: await api.setImportEdit(tx.id, input) });
        const updated = store.get().transactions.find((candidate) => candidate.id === tx.id) ?? tx;
        if (updated.kind !== 'transfer' && input.category && input.category !== updated.category) {
          const state = store.get();
          const overrides = { ...state.config.overrides };
          const matchesBaseline = input.category === baselineCategory(state, updated);
          if (matchesBaseline) delete overrides[tx.id];
          else overrides[tx.id] = input.category;
          const saved = await persistConfig(
            { ...state.config, overrides },
            () => (matchesBaseline ? api.clearOverride(tx.id) : api.setOverride(tx.id, input.category)),
          );
          if (!saved) return false;
        }
        const outside = !inRange(input, store.get().period) ? ' (fuori dal periodo mostrato)' : '';
        showToast(`Movimento aggiornato${outside}`);
        return true;
      } catch (error) {
        showToast(error.message, { tone: 'error' });
        return false;
      }
    },

    // Brings a transaction of the export back to how the export has it, category included.
    async resetImportEdit(tx) {
      try {
        setData({ importEdits: await api.clearImportEdit(tx.id) });
        const state = store.get();
        if (state.config.overrides[tx.id]) {
          const overrides = { ...state.config.overrides };
          delete overrides[tx.id];
          if (!await persistConfig({ ...state.config, overrides }, () => api.clearOverride(tx.id))) return false;
        }
        showToast('Movimento riportato com’era nell’export');
        return true;
      } catch (error) {
        showToast(error.message, { tone: 'error' });
        return false;
      }
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
