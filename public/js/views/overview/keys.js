// Chiavi di stato da cui dipendono i pannelli della panoramica.
export const OVERVIEW_KEYS = ['status', 'route', 'transactions', 'config', 'period', 'granularity', 'account', 'flow', 'focusCategory', 'theme'];

export const isOverviewVisible = (state) => state.status === 'ready' && state.route === 'overview';

export const FLOW_LABELS = {
  expense: { plural: 'Uscite', top: 'Spese più alte', empty: 'Nessuna spesa in questo periodo' },
  income: { plural: 'Entrate', top: 'Entrate più alte', empty: 'Nessuna entrata in questo periodo' },
};
