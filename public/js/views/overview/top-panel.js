import { html, render } from '../../lib/html.js';
import { icon } from '../../lib/icons.js';
import { describeTransaction } from '../../lib/aggregate.js';
import { formatDateShort, formatEUR } from '../../lib/format.js';
import { watch } from '../../state/store.js';
import { selectColorMaps, selectOverview } from '../../state/selectors.js';
import { emptyState, swatch } from '../../components/common.js';
import { FLOW_LABELS, OVERVIEW_KEYS, isOverviewVisible } from './keys.js';

const TOP_COUNT = 8;

export function mountTopPanel(element, store, actions) {
  element.addEventListener('click', (event) => {
    if (!event.target.closest('[data-action="all"]')) return;
    const { flow, focusCategory } = store.get();
    actions.showTransactions({ kind: flow, category: focusCategory ?? 'all', sort: { key: 'amount', dir: 'desc' } });
  });

  watch(store, OVERVIEW_KEYS, (state) => {
    if (!isOverviewVisible(state)) return;
    const { flowTransactions } = selectOverview(state);
    const colors = selectColorMaps(state)[state.flow];
    const top = [...flowTransactions].sort((a, b) => b.amount - a.amount).slice(0, TOP_COUNT);
    const flowLabel = FLOW_LABELS[state.flow];

    render(element, html`
      <header class="panel-head">
        <div>
          <h2 class="panel-title">${flowLabel.top}</h2>
          <p class="panel-sub">${state.focusCategory ? `In ${state.focusCategory}` : 'Nel periodo selezionato'}</p>
        </div>
        ${top.length ? html`<button type="button" class="btn btn-ghost btn-sm" data-action="all">Tutti i movimenti${icon('arrow-right', { size: 14 })}</button>` : ''}
      </header>
      ${top.length
        ? html`<table class="data-table compact-table">
            <caption class="sr-only">${flowLabel.top}</caption>
            <thead><tr><th scope="col">Data</th><th scope="col">Descrizione</th><th scope="col" class="num">Importo</th></tr></thead>
            <tbody>${top.map((tx) => html`<tr>
              <td class="muted nowrap">${formatDateShort(tx.date)}</td>
              <td>
                <span class="cell-title truncate">${describeTransaction(tx)}</span>
                <span class="cell-sub">${swatch(colors.colorOf(tx.category))}${tx.category} · ${tx.account}</span>
              </td>
              <td class="num strong nowrap">${formatEUR(tx.amount)}</td>
            </tr>`)}</tbody>
          </table>`
        : emptyState({ title: flowLabel.empty })}`);
  });
}
