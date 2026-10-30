export const ROUTES = {
  overview: { hash: '#/panoramica', title: 'Panoramica', short: 'Panoramica' },
  transactions: { hash: '#/movimenti', title: 'Movimenti', short: 'Movimenti' },
  rules: { hash: '#/categorie', title: 'Categorie e regole', short: 'Regole' },
};

// L'hash porta anche periodo e categoria esplorata (#/panoramica?p=12m&cat=Casa),
// così Indietro annulla uno zoom e un indirizzo salvato riapre la stessa vista.
function parseHash(hash) {
  const [path, query = ''] = hash.split('?');
  const route = Object.keys(ROUTES).find((key) => ROUTES[key].hash === path) ?? 'overview';
  return { route, params: new URLSearchParams(query) };
}

export function hashFor(route, { period, focusCategory } = {}) {
  const params = new URLSearchParams();
  if (period) {
    if (period.preset === 'custom') {
      params.set('dal', period.from);
      params.set('al', period.to);
    } else {
      params.set('p', period.preset);
    }
  }
  if (route === 'overview' && focusCategory) params.set('cat', focusCategory);
  const query = params.toString();
  return query ? `${ROUTES[route].hash}?${query}` : ROUTES[route].hash;
}

export function navigate(route) {
  if (parseHash(location.hash).route !== route) location.hash = ROUTES[route].hash;
}

// `onParams` riceve i parametri dell'hash quando l'utente arriva da un indirizzo o torna indietro.
export function startRouter(store, onParams = () => {}) {
  const sync = () => {
    const { route, params } = parseHash(location.hash);
    onParams(params, route);
    if (store.get().route !== route) store.set({ route });
  };
  window.addEventListener('hashchange', sync);
  window.addEventListener('popstate', sync);
  sync();
}

// Tiene l'hash allineato allo stato. Di norma sostituisce la voce di cronologia;
// dopo `markHistory()` ne aggiunge una nuova, perché Indietro torni allo stato precedente.
export function syncHash(state, { push = false } = {}) {
  const next = hashFor(state.route, state);
  if (location.hash === next) return;
  if (push) history.pushState(null, '', next);
  else history.replaceState(null, '', next);
}
