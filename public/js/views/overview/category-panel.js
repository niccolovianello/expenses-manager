import { html, render } from '../../lib/html.js';
import { icon } from '../../lib/icons.js';
import { groupTotals, relativeChange } from '../../lib/aggregate.js';
import { formatEUR, formatPercent } from '../../lib/format.js';
import { watch } from '../../state/store.js';
import { selectColorMaps, selectOverview } from '../../state/selectors.js';
import { delta, emptyState, swatch } from '../../components/common.js';
import { FLOW_LABELS, OVERVIEW_KEYS, isOverviewVisible } from './keys.js';

const COLLAPSED_ROWS = 8;
const NO_DESCRIPTION = 'Senza descrizione';
const detailKey = (tx) => tx.tag || tx.comment || NO_DESCRIPTION;

function rows(groups, previousGroups, { colorOf }) {
  const previous = new Map(previousGroups.map((group) => [group.key, group.total]));
  const total = groups.reduce((sum, group) => sum + group.total, 0);
  const max = groups[0]?.total || 1;
  return groups.map((group) => ({
    ...group,
    share: total ? group.total / total : 0,
    width: Math.max(1, (group.total / max) * 100),
    change: previousGroups.length ? relativeChange(group.total, previous.get(group.key) ?? 0) : null,
    colorVar: colorOf(group.key),
  }));
}

function row(item, attribute) {
  return html`<li>
    <button type="button" class="rank-row" ${attribute}="${item.key}">
      <span class="rank-name">${swatch(item.colorVar)}<span class="truncate">${item.key}</span></span>
      <span class="rank-amount num">${formatEUR(item.total)}</span>
      <span class="rank-bar" aria-hidden="true"><span style="width: ${item.width.toFixed(1)}%; --swatch: var(${item.colorVar})"></span></span>
      <span class="rank-meta"><span class="num">${formatPercent(item.share)}</span> · ${item.count} mov.</span>
      <span class="rank-delta">${item.change === null ? '' : delta(item.change, { reference: 'prec.' })}</span>
    </button>
  </li>`;
}

export function mountCategoryPanel(element, store, actions) {
  let expanded = false;

  element.addEventListener('click', (event) => {
    const target = event.target;
    const category = target.closest('[data-category]');
    if (category) return actions.focusCategory(category.dataset.category);
    const detail = target.closest('[data-detail]');
    if (detail) {
      const { flow, focusCategory } = store.get();
      const query = detail.dataset.detail === NO_DESCRIPTION ? '' : detail.dataset.detail;
      return actions.showTransactions({ kind: flow, category: focusCategory, query });
    }
    if (target.closest('[data-action="back"]')) return actions.focusCategory(null);
    if (target.closest('[data-action="expand"]')) {
      expanded = !expanded;
      paint(store.get());
    }
    if (target.closest('[data-empty-action="all"]')) actions.setPreset('all');
  });

  function paint(state) {
    if (!isOverviewVisible(state)) return;
    const { flowTransactions, previousFlowTransactions, compare } = selectOverview(state);
    const flowLabel = FLOW_LABELS[state.flow];
    const focus = state.focusCategory;
    const colors = selectColorMaps(state)[state.flow];

    const items = focus
      ? rows(groupTotals(flowTransactions, detailKey), compare ? groupTotals(previousFlowTransactions, detailKey) : [], {
          colorOf: () => colors.colorOf(focus),
        })
      : rows(groupTotals(flowTransactions, (tx) => tx.category), compare ? groupTotals(previousFlowTransactions, (tx) => tx.category) : [], {
          colorOf: colors.colorOf,
        });
    const visible = expanded ? items : items.slice(0, COLLAPSED_ROWS);

    render(element, html`
      <header class="panel-head">
        <div>
          ${focus
            ? html`<button type="button" class="link-btn" data-action="back">${icon('arrow-left', { size: 14 })}Tutte le categorie</button>
                   <h2 class="panel-title">${focus}</h2>
                   <p class="panel-sub">Per tag o descrizione · scegline uno per vedere i movimenti</p>`
            : html`<h2 class="panel-title">${flowLabel.plural} per categoria</h2>
                   <p class="panel-sub">Scegli una categoria per il dettaglio</p>`}
        </div>
      </header>
      ${items.length
        ? html`<ol class="rank-list">${visible.map((item) => row(item, focus ? 'data-detail' : 'data-category'))}</ol>
          ${items.length > COLLAPSED_ROWS
            ? html`<button type="button" class="link-btn panel-more" data-action="expand">
                ${icon(expanded ? 'chevron-up' : 'chevron-down', { size: 14 })}${expanded ? 'Mostra meno' : `Mostra tutte (${items.length})`}
              </button>`
            : ''}`
        : emptyState({ title: flowLabel.empty, actionLabel: 'Mostra tutto', action: 'all' })}`);
  }

  watch(store, OVERVIEW_KEYS, (state) => {
    if (state.focusCategory) expanded = false;
    paint(state);
  });
}
