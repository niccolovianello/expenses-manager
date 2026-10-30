import { RULE_KINDS } from '../../domain/categorize.js';
import { html, render } from '../../lib/html.js';
import { formatCount, formatEUR } from '../../lib/format.js';
import { watch } from '../../state/store.js';
import { selectCategorized, selectColorMaps } from '../../state/selectors.js';
import { swatch } from '../../components/common.js';

function summarize(categorized, kind) {
  const groups = new Map();
  for (const tx of categorized) {
    if (tx.kind !== kind) continue;
    const group = groups.get(tx.category) ?? { name: tx.category, count: 0, total: 0, edited: 0 };
    group.count += 1;
    group.total += tx.amount;
    if (tx.source === 'manual' || tx.source === 'rule') group.edited += 1;
    groups.set(tx.category, group);
  }
  return [...groups.values()].sort((a, b) => b.total - a.total);
}

export function mountCategoryTable(element, store, actions) {
  let kind = 'expense';

  element.addEventListener('click', (event) => {
    const kindButton = event.target.closest('[data-kind]');
    if (kindButton) {
      kind = kindButton.dataset.kind;
      return paint(store.get());
    }
    const row = event.target.closest('[data-category]');
    if (row) {
      actions.setPreset('all');
      actions.showTransactions({ kind, category: row.dataset.category });
    }
  });

  function paint(state) {
    if (state.status !== 'ready') return;
    const rows = summarize(selectCategorized(state), kind);
    const colors = selectColorMaps(state)[kind];
    render(element, html`
      <header class="panel-head">
        <div>
          <h2 class="panel-title">Categorie</h2>
          <p class="panel-sub">Tutto lo storico · scegline una per vedere i movimenti</p>
        </div>
        <div class="segmented" role="group" aria-label="Tipo di categoria">
          ${Object.entries(RULE_KINDS).map(([id, label]) => html`<button type="button" class="segmented-btn" data-kind="${id}" aria-pressed="${id === kind}">${label}</button>`)}
        </div>
      </header>
      <div class="table-scroll">
        <table class="data-table compact-table">
          <caption class="sr-only">Categorie di ${RULE_KINDS[kind]}</caption>
          <thead><tr>
            <th scope="col">Categoria</th>
            <th scope="col" class="num">Movimenti</th>
            <th scope="col" class="num col-edited">Ricategorizzati</th>
            <th scope="col" class="num">Totale</th>
          </tr></thead>
          <tbody>${rows.map((row) => html`<tr class="is-clickable" data-category="${row.name}">
            <th scope="row"><button type="button" class="row-link">${swatch(colors.colorOf(row.name))}${row.name}</button></th>
            <td class="num">${formatCount(row.count)}</td>
            <td class="num muted col-edited">${row.edited ? formatCount(row.edited) : '—'}</td>
            <td class="num strong">${formatEUR(row.total)}</td>
          </tr>`)}</tbody>
        </table>
      </div>`);
  }

  watch(store, ['status', 'config', 'transactions'], paint);
}
