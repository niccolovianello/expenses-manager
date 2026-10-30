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

export function createInitialState() {
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
    period: { preset: DEFAULT_PRESET, ...presetRange(DEFAULT_PRESET, todayISO(), null) },
    granularity: 'auto',
    account: 'all',
    flow: 'expense',
    focusCategory: null,
    txFilters: DEFAULT_TX_FILTERS,
    ruleDraft: null,
    theme: 0,
  };
}
