export const ROUTES = {
  overview: { hash: '#/panoramica', title: 'Panoramica' },
  transactions: { hash: '#/movimenti', title: 'Movimenti' },
  rules: { hash: '#/categorie', title: 'Categorie e regole' },
};

const routeFromHash = (hash) =>
  Object.keys(ROUTES).find((route) => ROUTES[route].hash === hash) ?? 'overview';

export function navigate(route) {
  if (location.hash !== ROUTES[route].hash) location.hash = ROUTES[route].hash;
}

export function startRouter(store) {
  const sync = () => store.set({ route: routeFromHash(location.hash) });
  window.addEventListener('hashchange', sync);
  sync();
}
