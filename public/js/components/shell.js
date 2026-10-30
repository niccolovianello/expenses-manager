import { html, render } from '../lib/html.js';
import { icon } from '../lib/icons.js';
import { formatCount, formatDate } from '../lib/format.js';
import { ROUTES } from '../router.js';
import { watch } from '../state/store.js';
import { selectExtent } from '../state/selectors.js';

const NAV_ICONS = { overview: 'dashboard', transactions: 'list', rules: 'tags' };
const ROUTES_WITH_PERIOD = ['overview', 'transactions'];

const importButton = (label, variant) => html`<label class="btn ${variant} file-btn">
  ${icon('upload')}<span>${label}</span>
  <input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" class="sr-only" data-import-file>
</label>`;

export function mountShell({ root, nav, railActions, views, periodBar, sourceInfo, status }, store, actions) {
  render(railActions, html`
    <button type="button" class="btn btn-ghost btn-sm" data-action="add-entry">${icon('plus')}<span>Nuovo movimento</span></button>
    ${importButton('Importa export', 'btn-ghost btn-sm')}
    <button type="button" class="btn btn-ghost btn-sm" data-action="lock">${icon('lock')}<span>Blocca</span></button>`);
  // On the phone the same navigation becomes the bottom bar, with "Nuovo" in the middle.
  const navLink = (route) => {
    const { hash, title, short } = ROUTES[route];
    return html`<a class="nav-link" href="${hash}" data-route="${route}">${icon(NAV_ICONS[route], { size: 20 })}<span class="nav-label">${title}</span><span class="nav-label-short" aria-hidden="true">${short}</span></a>`;
  };
  render(nav, html`
    ${navLink('overview')}
    ${navLink('transactions')}
    <button type="button" class="nav-add" data-action="add-entry" aria-label="Nuovo movimento"><span class="nav-add-mark">${icon('plus', { size: 20 })}</span><span class="nav-label-short" aria-hidden="true">Nuovo</span></button>
    ${navLink('rules')}`);

  let shownRoute = null;
  watch(store, ['route', 'status'], (state) => {
    const ready = state.status === 'ready';
    // Switching section starts at the top of the page, not at the previous section's scroll position.
    if (ready && shownRoute !== state.route) {
      if (shownRoute) window.scrollTo(0, 0);
      shownRoute = state.route;
    }
    for (const link of nav.querySelectorAll('[data-route]')) {
      if (link.dataset.route === state.route) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    }
    for (const [route, view] of Object.entries(views)) view.hidden = !ready || route !== state.route;
    nav.hidden = !ready;
    periodBar.hidden = !ready || !ROUTES_WITH_PERIOD.includes(state.route);
    document.title = `${ROUTES[state.route].title} · Spese`;
  });

  watch(store, ['status', 'error'], (state) => {
    status.hidden = state.status === 'ready';
    if (state.status === 'loading') {
      render(status, html`<div class="loading" aria-busy="true">
        <span class="sr-only">Caricamento dei movimenti…</span>
        <div class="skeleton skeleton-bar"></div>
        <div class="skeleton skeleton-strip"></div>
        <div class="skeleton-grid"><div class="skeleton skeleton-panel"></div><div class="skeleton skeleton-panel"></div></div>
      </div>`);
    } else if (state.status === 'empty') {
      render(status, html`<div class="onboarding">
        <h1 class="view-title">Importa i tuoi movimenti</h1>
        <p class="empty-body">Scegli l’export .xlsx dell’app di budgeting (fogli Spese, Entrate e Bonifici).
          Il file viene letto in questo browser e salvato su Firebase solo dopo essere stato cifrato con il tuo codice.</p>
        <div class="onboarding-actions">
          ${importButton('Scegli il file .xlsx', 'btn-primary')}
          <button type="button" class="btn btn-secondary" data-action="add-entry">${icon('plus')}Inizia inserendo a mano</button>
        </div>
      </div>`);
    } else if (state.status === 'error') {
      render(status, html`<div class="error-state" role="alert">
        ${icon('alert', { size: 24 })}
        <div>
          <p class="empty-title">Non riesco a caricare i movimenti</p>
          <p class="empty-body">${state.error}</p>
          <button type="button" class="btn btn-primary btn-sm" data-action="retry">${icon('refresh')}Riprova</button>
        </div>
      </div>`);
    }
  });
  status.addEventListener('click', (event) => {
    if (event.target.closest('[data-action="retry"]')) actions.load();
  });

  root.addEventListener('change', (event) => {
    if (!event.target.matches('[data-import-file]')) return;
    actions.importFile(event.target.files[0]);
    event.target.value = '';
  });
  root.addEventListener('click', (event) => {
    if (event.target.closest('[data-action="lock"]')) actions.lock();
    if (event.target.closest('[data-action="add-entry"]')) actions.openEntryForm();
  });

  watch(store, ['importing'], (state) => {
    for (const control of root.querySelectorAll('.file-btn')) {
      control.classList.toggle('is-busy', state.importing);
      control.querySelector('input').disabled = state.importing;
    }
    root.setAttribute('aria-busy', String(state.importing));
  });

  watch(store, ['meta', 'transactions'], (state) => {
    const extent = selectExtent(state);
    if (!state.meta || !extent) return render(sourceInfo, '');
    render(sourceInfo, html`
      <p class="source-name" title="${state.meta.fileName}">${state.meta.fileName}</p>
      <p>${formatCount(state.transactions.length)} movimenti</p>
      <p>${formatDate(extent.from)} – ${formatDate(extent.to)}</p>
      <p>Importato il ${formatDate(state.meta.updatedAt.slice(0, 10))}</p>`);
  });
}
