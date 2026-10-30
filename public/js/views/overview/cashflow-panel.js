import { html, render, collectRefs } from '../../lib/html.js';
import { icon } from '../../lib/icons.js';
import { timeSeries } from '../../lib/aggregate.js';
import { formatBucketLabel, formatBucketTitle, formatSignedEUR, GRANULARITY_NOUN } from '../../lib/format.js';
import { watch } from '../../state/store.js';
import { selectOverview } from '../../state/selectors.js';
import { createBarChart, exploreHint } from '../../charts/bar-chart.js';
import { emptyState, legend, seriesTable } from '../../components/common.js';
import { OVERVIEW_KEYS, isOverviewVisible } from './keys.js';

const SERIES = [
  { kind: 'income', label: 'Entrate', colorVar: '--flow-in' },
  { kind: 'expense', label: 'Uscite', colorVar: '--flow-out' },
];

function buildModel(state) {
  const { buckets, granularity, current } = selectOverview(state);
  const matrix = timeSeries(current.filter((tx) => tx.kind !== 'transfer'), buckets, granularity, (tx) => tx.kind);
  const empty = new Array(buckets.length).fill(0);
  const series = SERIES.map((item) => ({
    ...item,
    data: (matrix.get(item.kind) ?? empty).map((value) => Math.round(value * 100) / 100),
  }));
  const [income, expense] = series;
  return {
    granularity,
    buckets,
    hasData: matrix.size > 0,
    labels: buckets.map((bucket) => formatBucketLabel(bucket.key, granularity)),
    titles: buckets.map((bucket) => formatBucketTitle(bucket, granularity)),
    series,
    footer: (index) => [`Saldo: ${formatSignedEUR(income.data[index] - expense.data[index])}`, buckets.length > 1 ? exploreHint() : '']
      .filter(Boolean).join('\n'),
  };
}

export function mountCashflowPanel(element, store, actions) {
  render(element, html`
    <header class="panel-head">
      <div>
        <h2 class="panel-title">Entrate e uscite</h2>
        <p class="panel-sub" data-ref="sub"></p>
      </div>
      <button type="button" class="btn btn-ghost btn-sm" data-ref="toggle" aria-pressed="false"></button>
    </header>
    <div class="chart-box chart-box-short" data-ref="chartBox"><canvas data-ref="canvas" role="img" aria-label="Entrate e uscite per intervallo. Dati disponibili anche in tabella."></canvas></div>
    <div class="table-box" data-ref="tableBox" hidden></div>
    <ul class="legend" data-ref="legend">${legend(SERIES)}</ul>
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

  function paint(state) {
    if (!isOverviewVisible(state)) return;
    model = buildModel(state);
    refs.sub.textContent = `Per ${GRANULARITY_NOUN[model.granularity]}, giroconti esclusi`;
    refs.empty.hidden = model.hasData;
    refs.toggle.hidden = !model.hasData;
    refs.legend.hidden = !model.hasData;
    refs.chartBox.hidden = !model.hasData || showTable;
    refs.tableBox.hidden = !model.hasData || !showTable;
    if (!model.hasData) {
      render(refs.empty, emptyState({ title: 'Nessun movimento in questo periodo' }));
      return;
    }
    if (showTable) {
      render(refs.tableBox, seriesTable({ caption: 'Entrate e uscite', titles: model.titles, series: model.series, showTotal: false }));
      return;
    }
    if (!chart) {
      chart = createBarChart(refs.canvas, {
        onSelect: (index) => {
          if (model.buckets.length > 1) actions.zoomTo(model.buckets[index]);
        },
      });
    }
    chart.update(model);
  }

  watch(store, OVERVIEW_KEYS, paint);
}
