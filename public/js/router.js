export const ROUTES = {
  overview: { hash: '#/panoramica', title: 'Panoramica', short: 'Panoramica' },
  transactions: { hash: '#/movimenti', title: 'Movimenti', short: 'Movimenti' },
  rules: { hash: '#/categorie', title: 'Categorie e regole', short: 'Regole' },
};

// The hash also carries the period and explored category (#/panoramica?p=12m&cat=Casa),
// so Back undoes a zoom and a saved address reopens the same view.
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

// `onParams` receives the hash parameters when the user arrives from an address or goes back.
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

// Keeps the hash in sync with the state. Normally it replaces the history entry;
// after `markHistory()` it pushes a new one, so Back returns to the previous state.
export function syncHash(state, { push = false } = {}) {
  const next = hashFor(state.route, state);
  if (location.hash === next) return;
  if (push) history.pushState(null, '', next);
  else history.replaceState(null, '', next);
}
