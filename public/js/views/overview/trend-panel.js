import { html, render, collectRefs } from '../../lib/html.js';
import { icon } from '../../lib/icons.js';
import { timeSeries } from '../../lib/aggregate.js';
import { formatBucketLabel, formatBucketTitle, formatEUR, GRANULARITY_NOUN } from '../../lib/format.js';
import { watch } from '../../state/store.js';
import { selectColorMaps, selectOverview } from '../../state/selectors.js';
import { createBarChart } from '../../charts/bar-chart.js';
import { OTHER_COLOR, OTHER_KEY, OTHER_LABEL } from '../../charts/palette.js';
import { emptyState, legend, seriesTable } from '../../components/common.js';
import { FLOW_LABELS, OVERVIEW_KEYS, isOverviewVisible } from './keys.js';

function buildModel(state) {
  const overview = selectOverview(state);
  const { buckets, granularity, flowTransactions } = overview;
  const colors = selectColorMaps(state)[state.flow];
  const focus = state.focusCategory;
  const keyOf = focus ? () => focus : (tx) => (colors.has(tx.category) ? tx.category : OTHER_KEY);
  const matrix = timeSeries(flowTransactions, buckets, granularity, keyOf);

  const order = focus ? [focus] : [...colors.slotted, OTHER_KEY];
  const series = order
    .filter((key) => matrix.has(key))
    .map((key) => ({
      label: key === OTHER_KEY ? OTHER_LABEL : key,
      data: matrix.get(key).map((value) => Math.round(value * 100) / 100),
      colorVar: key === OTHER_KEY ? OTHER_COLOR : colors.colorOf(key),
    }));
  const totalAt = (index) => series.reduce((sum, item) => sum + item.data[index], 0);

  return {
    overview,
    labels: buckets.map((bucket) => formatBucketLabel(bucket.key, granularity)),
    titles: buckets.map((bucket) => formatBucketTitle(bucket, granularity)),
    series,
    footer: (index) => [series.length > 1 ? `Totale: ${formatEUR(totalAt(index))}` : '', buckets.length > 1 ? 'Clic per esplorare il periodo' : '']
      .filter(Boolean).join('\n'),
  };
}

export function mountTrendPanel(element, store, actions) {
  render(element, html`
    <header class="panel-head">
      <div>
        <h2 class="panel-title" data-ref="title"></h2>
        <p class="panel-sub" data-ref="sub"></p>
      </div>
      <button type="button" class="btn btn-ghost btn-sm" data-ref="toggle" aria-pressed="false"></button>
    </header>
    <div class="chart-box" data-ref="chartBox"><canvas data-ref="canvas" role="img"></canvas></div>
    <div class="table-box" data-ref="tableBox" hidden></div>
    <ul class="legend" data-ref="legend"></ul>
    <div data-ref="empty" hidden></div>`);

  const refs = collectRefs(element);
  let chart = null;
  let showTable = false;
  let model = null;

  const syncToggle = () => {
    refs.toggle.setAttribute('aria-pressed', String(showTable));
    render(refs.toggle, showTable ? html`${icon('chart')}Grafico` : html`${icon('table')}Tabella`);
  };
  syncToggle();

  refs.toggle.addEventListener('click', () => {
    showTable = !showTable;
    syncToggle();
    paint(store.get());
  });
  refs.empty.addEventListener('click', (event) => {
    if (event.target.closest('[data-empty-action="all"]')) actions.setPreset('all');
  });

  function paint(state) {
    if (!isOverviewVisible(state)) return;
    model = buildModel(state);
    const { granularity } = model.overview;
    const flowLabel = FLOW_LABELS[state.flow];
    const hasData = model.series.length > 0;

    refs.title.textContent = state.focusCategory ? `${state.focusCategory} nel tempo` : `${flowLabel.plural} nel tempo`;
    refs.sub.textContent = state.focusCategory
      ? `Totale per ${GRANULARITY_NOUN[granularity]}`
      : `Per categoria, totale per ${GRANULARITY_NOUN[granularity]}`;

    refs.empty.hidden = hasData;
    refs.toggle.hidden = !hasData;
    refs.chartBox.hidden = !hasData || showTable;
    refs.tableBox.hidden = !hasData || !showTable;
    refs.legend.hidden = !hasData || model.series.length < 2;
    if (!hasData) {
      render(refs.empty, emptyState({ title: flowLabel.empty, body: 'Prova un periodo più ampio o un altro conto.', actionLabel: 'Mostra tutto', action: 'all' }));
      return;
    }

    render(refs.legend, legend(model.series));
    if (showTable) {
      render(refs.tableBox, seriesTable({ caption: refs.title.textContent, titles: model.titles, series: model.series }));
      return;
    }
    if (!chart) {
      chart = createBarChart(refs.canvas, {
        stacked: true,
        onSelect: (index) => {
          const bucket = model.overview.buckets[index];
          if (model.overview.buckets.length > 1) actions.zoomTo(bucket);
        },
      });
    }
    refs.canvas.setAttribute('aria-label', `${refs.title.textContent}, ${model.titles[0]} – ${model.titles.at(-1)}. Dati disponibili anche in tabella.`);
    chart.update(model);
  }

  watch(store, OVERVIEW_KEYS, paint);
}
