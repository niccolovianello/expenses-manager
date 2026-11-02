import { html, render, collectRefs } from '../../lib/html.js';
import { icon } from '../../lib/icons.js';
import { groupTotals, relativeChange } from '../../lib/aggregate.js';
import { formatEUR, formatPercent } from '../../lib/format.js';
import { watch } from '../../state/store.js';
import { selectColorMaps, selectOverview } from '../../state/selectors.js';
import { createRingChart } from '../../charts/ring-chart.js';
import { OTHER_COLOR, OTHER_LABEL } from '../../charts/palette.js';
import { delta, emptyState } from '../../components/common.js';
import { FLOW_LABELS, OVERVIEW_KEYS, isOverviewVisible } from './keys.js';

const COLLAPSED_ROWS = 8;
const NO_DESCRIPTION = 'Senza descrizione';
const detailKey = (tx) => tx.tag || tx.comment || NO_DESCRIPTION;

// Inside a category every detail shares its color: in the ring the first ones get lighter shades
// of it, the rest are grouped into a single gray slice.
const DETAIL_SHADES = [1, 0.8, 0.64, 0.5, 0.38, 0.28];
const OTHER_DETAILS_LABEL = 'Altre voci';

const VIEWS = [
  { id: 'list', label: 'Elenco', icon: 'list' },
  { id: 'ring', label: 'Anello', icon: 'ring' },
];

const cssColor = ({ colorVar, mix = 1 }) =>
  mix >= 1 ? `var(${colorVar})` : `color-mix(in srgb, var(${colorVar}) ${Math.round(mix * 100)}%, var(--surface))`;

function rows(groups, previousGroups, { colorOf }) {
  const previous = new Map(previousGroups.map((group) => [group.key, group.total]));
  const total = groups.reduce((sum, group) => sum + group.total, 0);
  const max = groups[0]?.total || 1;
  return groups.map((group, index) => ({
    ...group,
    share: total ? group.total / total : 0,
    width: Math.max(1, (group.total / max) * 100),
    change: previousGroups.length ? relativeChange(group.total, previous.get(group.key) ?? 0) : null,
    ...colorOf(group.key, index),
  }));
}

// One slice per colored row; the gray rows are merged into a single slice at the end.
function slices(items, otherLabel) {
  const colored = items.filter((item) => item.colorVar !== OTHER_COLOR);
  const rest = items.filter((item) => item.colorVar === OTHER_COLOR);
  const result = colored.map((item) => ({ ...item, label: item.key, selectable: true }));
  if (rest.length) {
    const single = rest.length === 1;
    result.push({
      key: single ? rest[0].key : null,
      label: single ? rest[0].key : otherLabel,
      total: rest.reduce((sum, item) => sum + item.total, 0),
      share: rest.reduce((sum, item) => sum + item.share, 0),
      colorVar: OTHER_COLOR,
      selectable: single,
    });
  }
  return result;
}

function row(item, attribute, { compact }) {
  return html`<li>
    <button type="button" class="rank-row" ${attribute}="${item.key}">
      <span class="rank-name"><span class="swatch" style="--swatch: ${cssColor(item)}" aria-hidden="true"></span><span class="truncate">${item.key}</span></span>
      <span class="rank-amount num">${formatEUR(item.total)}</span>
      ${compact ? '' : html`<span class="rank-bar" aria-hidden="true"><span style="width: ${item.width.toFixed(1)}%; --swatch: ${cssColor(item)}"></span></span>`}
      <span class="rank-meta"><span class="num">${formatPercent(item.share)}</span> · ${item.count} mov.</span>
      <span class="rank-delta">${item.change === null ? '' : delta(item.change, { reference: 'prec.' })}</span>
    </button>
  </li>`;
}

export function mountCategoryPanel(element, store, actions) {
  render(element, html`
    <header class="panel-head">
      <div data-ref="heading"></div>
      <div class="segmented segmented-icons" role="group" aria-label="Vista" data-ref="views">
        ${VIEWS.map((view) => html`<button type="button" class="segmented-btn" data-view="${view.id}" aria-pressed="false" aria-label="${view.label}" title="${view.label}">${icon(view.icon, { size: 16 })}</button>`)}
      </div>
    </header>
    <div class="ring-box" data-ref="ringBox" hidden>
      <canvas data-ref="canvas" role="img"></canvas>
      <div class="ring-center" aria-hidden="true">
        <span class="ring-total num" data-ref="ringTotal"></span>
        <span class="ring-label" data-ref="ringLabel"></span>
      </div>
    </div>
    <div data-ref="list"></div>`);

  const refs = collectRefs(element);
  let expanded = false;
  let view = 'list';
  let chart = null;

  const openDetail = (key) => {
    const { flow, focusCategory } = store.get();
    const query = key === NO_DESCRIPTION ? '' : key;
    actions.showTransactions({ kind: flow, category: focusCategory, query });
  };

  element.addEventListener('click', (event) => {
    const target = event.target;
    const viewButton = target.closest('[data-view]');
    if (viewButton) {
      view = viewButton.dataset.view;
      return paint(store.get());
    }
    const category = target.closest('[data-category]');
    if (category) return actions.focusCategory(category.dataset.category);
    const detail = target.closest('[data-detail]');
    if (detail) return openDetail(detail.dataset.detail);
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
    const ring = view === 'ring';

    const items = focus
      ? rows(groupTotals(flowTransactions, detailKey), compare ? groupTotals(previousFlowTransactions, detailKey) : [], {
          colorOf: (_key, index) => {
            if (!ring) return { colorVar: colors.colorOf(focus) };
            return index < DETAIL_SHADES.length ? { colorVar: colors.colorOf(focus), mix: DETAIL_SHADES[index] } : { colorVar: OTHER_COLOR };
          },
        })
      : rows(groupTotals(flowTransactions, (tx) => tx.category), compare ? groupTotals(previousFlowTransactions, (tx) => tx.category) : [], {
          colorOf: (key) => ({ colorVar: colors.colorOf(key) }),
        });
    const visible = expanded ? items : items.slice(0, COLLAPSED_ROWS);

    render(refs.heading, focus
      ? html`<button type="button" class="link-btn" data-action="back">${icon('arrow-left', { size: 14 })}Tutte le categorie</button>
             <h2 class="panel-title">${focus}</h2>
             <p class="panel-sub">Per tag o descrizione · scegline uno per vedere i movimenti</p>`
      : html`<h2 class="panel-title">${flowLabel.plural} per categoria</h2>
             <p class="panel-sub">Scegli una categoria per il dettaglio</p>`);

    for (const button of refs.views.querySelectorAll('[data-view]')) {
      button.setAttribute('aria-pressed', String(button.dataset.view === view));
    }
    refs.views.hidden = !items.length;
    refs.ringBox.hidden = !ring || !items.length;

    if (ring && items.length) {
      if (!chart) {
        chart = createRingChart(refs.canvas, {
          onSelect: (slice) => (store.get().focusCategory ? openDetail(slice.key) : actions.focusCategory(slice.key)),
        });
      }
      const total = items.reduce((sum, item) => sum + item.total, 0);
      refs.ringTotal.textContent = formatEUR(total);
      refs.ringLabel.textContent = focus ? 'Totale categoria' : `${flowLabel.plural} totali`;
      refs.canvas.setAttribute('aria-label', `${focus ?? `${flowLabel.plural} per categoria`}: quote sul totale di ${formatEUR(total)}. Valori anche nell'elenco.`);
      chart.update({ slices: slices(items, focus ? OTHER_DETAILS_LABEL : OTHER_LABEL) });
    }

    const attribute = focus ? 'data-detail' : 'data-category';
    render(refs.list, items.length
      ? html`<ol class="rank-list${ring ? ' rank-list-compact' : ''}">${visible.map((item) => row(item, attribute, { compact: ring }))}</ol>
        ${items.length > COLLAPSED_ROWS
          ? html`<button type="button" class="link-btn panel-more" data-action="expand">
              ${icon(expanded ? 'chevron-up' : 'chevron-down', { size: 14 })}${expanded ? 'Mostra meno' : `Mostra tutte (${items.length})`}
            </button>`
          : ''}`
      : emptyState({ title: flowLabel.empty, actionLabel: 'Mostra tutto', action: 'all' }));
  }

  watch(store, OVERVIEW_KEYS, (state) => {
    if (state.focusCategory) expanded = false;
    paint(state);
  });
}
