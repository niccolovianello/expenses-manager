import { todayISO } from '../lib/dates.js';
import { DEFAULT_PRESET, presetRange } from '../lib/periods.js';

export const DEFAULT_TX_FILTERS = {
  query: '',
  kind: 'all',
  category: 'all',
  onlyEdited: false,
  sort: { key: 'date', dir: 'desc' },
  limit: 100,
};

// `preset`: il periodo con cui si apre l'app (sul telefono il mese in corso).
export function createInitialState({ preset = DEFAULT_PRESET } = {}) {
  return {
    status: 'loading',
    importing: false,
    error: null,
    transactions: [],
    imported: [],
    entries: [],
    entryDraft: null,
    meta: null,
    config: { rules: [], overrides: {} },
    route: 'overview',
    period: { preset, ...presetRange(preset, todayISO(), null) },
    zoomFrom: null,
    granularity: 'auto',
    account: 'all',
    flow: 'expense',
    focusCategory: null,
    txFilters: DEFAULT_TX_FILTERS,
    ruleDraft: null,
    theme: 0,
  };
}
