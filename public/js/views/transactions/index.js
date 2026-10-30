import { html, render, collectRefs } from '../../lib/html.js';
import { icon } from '../../lib/icons.js';
import { debounce } from '../../lib/memo.js';
import { totals } from '../../lib/aggregate.js';
import { formatCount, formatDateLong, formatEUR, formatRange } from '../../lib/format.js';
import { watch } from '../../state/store.js';
import { DEFAULT_TX_FILTERS } from '../../state/initial.js';
import { selectCategories, selectTransactionRows } from '../../state/selectors.js';
import { emptyState } from '../../components/common.js';
import { transactionRow } from './row.js';
import { startNewCategory } from './new-category.js';
import { mountEntryForm } from './entry-form.js';

const KINDS = [
  { id: 'all', label: 'Tutti' },
  { id: 'expense', label: 'Uscite' },
  { id: 'income', label: 'Entrate' },
  { id: 'transfer', label: 'Giroconti' },
];

const COLUMNS = [
  { key: 'date', label: 'Data' },
  { key: 'description', label: 'Descrizione' },
  { key: 'category', label: 'Categoria' },
  { key: 'account', label: 'Conto' },
  { key: 'amount', label: 'Importo', numeric: true },
];

const KEYS = ['status', 'route', 'transactions', 'config', 'period', 'account', 'txFilters'];
const isVisible = (state) => state.status === 'ready' && state.route === 'transactions';

export function mountTransactions(element, store, actions) {
  render(element, html`
    <header class="view-head">
      <div class="view-heading">
        <h1 class="view-title">Movimenti</h1>
        <p class="view-sub" data-ref="sub"></p>
      </div>
      <button type="button" class="btn btn-primary" data-action="new-entry">${icon('plus')}Nuovo movimento</button>
    </header>
    <section class="panel entry-panel" data-ref="entry" hidden></section>
    <section class="panel panel-flush">
      <div class="filter-bar">
        <label class="search-field">
          ${icon('search')}
          <span class="sr-only">Cerca per descrizione, tag, categoria, conto o importo</span>
          <input type="search" class="input" name="query" data-ref="query" placeholder="Cerca movimenti" autocomplete="off">
        </label>
        <div class="segmented" role="group" aria-label="Tipo di movimento">
          ${KINDS.map((kind) => html`<button type="button" class="segmented-btn" data-filter-kind="${kind.id}" aria-pressed="false">${kind.label}</button>`)}
        </div>
        <label class="field-inline">
          <span class="field-label">Categoria</span>
          <select class="input" name="category" data-ref="category"></select>
        </label>
        <label class="check">
          <input type="checkbox" name="onlyEdited" data-ref="onlyEdited">
          <span>Solo ricategorizzati</span>
        </label>
      </div>
      <div class="table-scroll" data-ref="table"></div>
      <footer class="table-foot" data-ref="foot"></footer>
    </section>`);

  const refs = collectRefs(element);
  mountEntryForm(refs.entry, store, actions);
  const phone = window.matchMedia('(max-width: 640px)');
  let rowsById = new Map();
  let openId = null;
  let renderedCategories = null;

  const applyQuery = debounce((query) => actions.setTxFilters({ query }), 150);

  element.addEventListener('input', (event) => {
    if (event.target === refs.query) applyQuery(refs.query.value);
  });

  element.addEventListener('change', (event) => {
    const target = event.target;
    if (target === refs.category) return actions.setTxFilters({ category: target.value });
    if (target === refs.onlyEdited) return actions.setTxFilters({ onlyEdited: target.checked });
    if (target.dataset.action === 'category') {
      const tx = rowsById.get(target.dataset.id);
      if (target.value === '__new__') {
        startNewCategory(target, {
          onCommit: (category) => actions.setCategory(tx, category),
          onCancel: () => paint(store.get()),
        });
      } else {
        actions.setCategory(tx, target.value);
      }
    }
  });

  element.addEventListener('click', (event) => {
    const target = event.target;
    const kind = target.closest('[data-filter-kind]');
    if (kind) return actions.setTxFilters({ kind: kind.dataset.filterKind });
    const sort = target.closest('[data-sort]');
    if (sort) {
      const { sort: current } = store.get().txFilters;
      const key = sort.dataset.sort;
      const dir = current.key === key && current.dir === 'desc' ? 'asc' : 'desc';
      return actions.setTxFilters({ sort: { key, dir } });
    }
    const action = target.closest('[data-action]')?.dataset.action;
    const tx = rowsById.get(target.closest('[data-id]')?.dataset.id);
    const row = target.closest('tr');
    const tappedRow = phone.matches && row?.querySelector('[data-action="toggle-row"]') && !target.closest('button, select, input, a, label');
    if ((action === 'toggle-row' || tappedRow) && tx) {
      openId = openId === tx.id ? null : tx.id;
      paint(store.get());
      return element.querySelector(`tr[data-id="${CSS.escape(tx.id)}"] [data-action="toggle-row"]`)?.focus({ preventScroll: true });
    }
    if (action === 'new-entry') return actions.openEntryForm();
    if (action === 'edit-entry' && tx) return actions.openEntryForm(tx);
    if (action === 'reset' && tx) return actions.resetCategory(tx);
    if (action === 'rule' && tx) {
      const field = tx.comment ? 'comment' : tx.tag ? 'tag' : 'account';
      return actions.draftRule({ kind: tx.kind, field, operator: 'contains', value: tx[field], category: tx.category });
    }
    if (action === 'more') return actions.showMoreTransactions();
    if (target.closest('[data-empty-action="reset"]')) {
      refs.query.value = '';
      actions.setTxFilters({ ...DEFAULT_TX_FILTERS });
    }
  });

  function syncFilters(state) {
    const filters = state.txFilters;
    if (document.activeElement !== refs.query && refs.query.value !== filters.query) refs.query.value = filters.query;
    for (const button of element.querySelectorAll('[data-filter-kind]')) {
      button.setAttribute('aria-pressed', String(button.dataset.filterKind === filters.kind));
    }
    const categories = selectCategories(state);
    if (categories !== renderedCategories) {
      renderedCategories = categories;
      const all = [...new Set([...categories.expense, ...categories.income])].sort((a, b) => a.localeCompare(b, 'it'));
      render(refs.category, html`<option value="all">Tutte le categorie</option>${all.map((name) => html`<option value="${name}">${name}</option>`)}`);
    }
    if (filters.category !== 'all' && !refs.category.querySelector(`option[value="${CSS.escape(filters.category)}"]`)) {
      refs.category.append(new Option(filters.category, filters.category));
    }
    refs.category.value = filters.category;
    refs.onlyEdited.checked = filters.onlyEdited;
  }

  function paint(state) {
    if (!isVisible(state)) return;
    syncFilters(state);
    const filters = state.txFilters;
    const rows = selectTransactionRows(state);
    const shown = rows.slice(0, filters.limit);
    rowsById = new Map(shown.map((tx) => [tx.id, tx]));
    const sum = totals(rows);

    refs.sub.textContent = `${formatCount(rows.length)} movimenti · ${formatRange(state.period)} · uscite ${formatEUR(sum.expense)} · entrate ${formatEUR(sum.income)}`;

    if (!rows.length) {
      render(refs.table, emptyState({
        title: 'Nessun movimento corrisponde ai filtri',
        body: 'Cambia la ricerca o il periodo, oppure azzera i filtri.',
        actionLabel: 'Azzera filtri',
        action: 'reset',
      }));
      render(refs.foot, '');
      return;
    }

    const categories = selectCategories(state);
    // When sorted by date, transactions on the phone are grouped by day (the date is not repeated on every row).
    const grouped = filters.sort.key === 'date';
    const body = shown.map((tx, index) => html`${grouped && tx.date !== shown[index - 1]?.date
      ? html`<tr class="day-row"><th colspan="6" scope="colgroup">${formatDateLong(tx.date)}</th></tr>` : ''}${transactionRow(tx, state, categories, tx.id === openId)}`);
    render(refs.table, html`<table class="data-table tx-table${grouped ? ' is-grouped' : ''}">
      <caption class="sr-only">Movimenti filtrati</caption>
      <thead><tr>
        ${COLUMNS.map((column) => {
          const active = filters.sort.key === column.key;
          const ariaSort = active ? (filters.sort.dir === 'asc' ? 'ascending' : 'descending') : 'none';
          return html`<th scope="col" class="${column.numeric ? 'num' : ''}" aria-sort="${ariaSort}">
            <button type="button" class="sort-btn" data-sort="${column.key}">
              ${column.label}${active ? icon(filters.sort.dir === 'asc' ? 'arrow-up' : 'arrow-down', { size: 13 }) : ''}
            </button>
          </th>`;
        })}
        <th scope="col"><span class="sr-only">Azioni</span></th>
      </tr></thead>
      <tbody>${body}</tbody>
    </table>`);

    render(refs.foot, html`
      <span class="muted">Mostrati ${formatCount(shown.length)} di ${formatCount(rows.length)}</span>
      ${rows.length > shown.length ? html`<button type="button" class="btn btn-secondary btn-sm" data-action="more">Mostra altri</button>` : ''}`);
  }

  watch(store, KEYS, paint);
}
