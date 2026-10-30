import { cssVar } from './theme.js';
import { formatAxisEUR, formatEUR } from '../lib/format.js';

const DATA_END_RADIUS = 4;

// On touch, the first tap shows the bar's values and a second tap on the same bar drills into it:
// a single tap must not change the period for someone who only wanted to read.
const touch = window.matchMedia('(hover: none)');
export const exploreHint = () => (touch.matches ? 'Tocca di nuovo per esplorare il periodo' : 'Clic per esplorare il periodo');

// Bar chart (stacked or grouped) with tooltips and click on a single interval.
// model: { labels, titles, series: [{ label, data, colorVar }], footer?(index) }
export function createBarChart(canvas, { stacked = false, onSelect } = {}) {
  let model = { labels: [], titles: [], series: [] };
  let armed = null;

  // Only the end of the stack (or bar) is rounded; the base stays anchored to the axis.
  const radius = ({ chart, datasetIndex, dataIndex }) => {
    if (stacked) {
      const datasets = chart.data.datasets;
      for (let i = datasetIndex + 1; i < datasets.length; i++) {
        if (datasets[i].data[dataIndex] > 0) return 0;
      }
    }
    return { topLeft: DATA_END_RADIUS, topRight: DATA_END_RADIUS, bottomLeft: 0, bottomRight: 0 };
  };

  const chart = new window.Chart(canvas, {
    type: 'bar',
    data: { labels: [], datasets: [] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 200 },
      interaction: { mode: 'index', intersect: false },
      datasets: {
        bar: {
          borderRadius: radius,
          borderSkipped: false,
          maxBarThickness: 36,
          categoryPercentage: stacked ? 0.72 : 0.7,
          barPercentage: stacked ? 1 : 0.86,
        },
      },
      scales: {
        x: { stacked, grid: { display: false }, ticks: { maxRotation: 0, autoSkipPadding: 14 } },
        y: {
          stacked,
          beginAtZero: true,
          border: { display: false },
          ticks: { maxTicksLimit: 5, callback: (value) => formatAxisEUR(value) },
        },
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          filter: (item) => item.parsed.y > 0,
          itemSort: (a, b) => b.datasetIndex - a.datasetIndex,
          callbacks: {
            title: (items) => model.titles[items[0]?.dataIndex] ?? '',
            label: (item) => ` ${item.dataset.label}: ${formatEUR(item.parsed.y)}`,
            footer: (items) => (items.length ? model.footer?.(items[0].dataIndex) ?? '' : ''),
          },
        },
      },
      onClick: (_event, elements) => {
        if (!onSelect || !elements.length) return;
        const { index } = elements[0];
        if (touch.matches && armed !== index) {
          armed = index;
          return;
        }
        armed = null;
        onSelect(index);
      },
      onHover: (event, elements) => {
        if (onSelect) event.native.target.style.cursor = elements.length ? 'pointer' : 'default';
      },
    },
  });

  function update(next) {
    model = next;
    armed = null;
    const surface = cssVar('--surface');
    chart.options.scales.x.border = { color: cssVar('--border-strong') };
    chart.options.scales.y.grid = { color: cssVar('--grid') };
    chart.data.labels = next.labels;
    chart.data.datasets = next.series.map((series) => {
      const color = cssVar(series.colorVar);
      return {
        label: series.label,
        data: series.data,
        backgroundColor: color,
        hoverBackgroundColor: color,
        borderColor: surface,
        // A 2px surface-colored gap separates stacked segments.
        borderWidth: stacked ? { top: 2, bottom: 0, left: 0, right: 0 } : 0,
      };
    });
    chart.update();
  }

  return { update, refresh: () => update(model), destroy: () => chart.destroy() };
}
