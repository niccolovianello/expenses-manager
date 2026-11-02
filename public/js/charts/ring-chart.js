import { cssVar } from './theme.js';
import { formatEUR, formatPercent } from '../lib/format.js';

const touch = window.matchMedia('(hover: none)');

// Resolves a token, or a 0–1 mix of a token with the surface, to a color the canvas understands.
export function resolveColor({ colorVar, mix = 1 }) {
  const color = cssVar(colorVar);
  if (mix >= 1) return color;
  const surface = cssVar('--surface');
  const channel = (hex, index) => parseInt(hex.slice(1 + index * 2, 3 + index * 2), 16);
  const mixed = [0, 1, 2].map((index) => Math.round(channel(color, index) * mix + channel(surface, index) * (1 - mix)));
  return `#${mixed.map((value) => value.toString(16).padStart(2, '0')).join('')}`;
}

// Doughnut chart of shares; as with the bars, on touch the first tap reads and the second drills in.
// model: { slices: [{ key, label, total, share, colorVar, mix?, selectable }] }
export function createRingChart(canvas, { onSelect } = {}) {
  let model = { slices: [] };
  let armed = null;

  const chart = new window.Chart(canvas, {
    type: 'doughnut',
    data: { labels: [], datasets: [] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 200 },
      cutout: '68%',
      layout: { padding: 4 },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: (items) => model.slices[items[0]?.dataIndex]?.label ?? '',
            label: (item) => {
              const slice = model.slices[item.dataIndex];
              return ` ${formatEUR(slice.total)} · ${formatPercent(slice.share)}`;
            },
          },
        },
      },
      onClick: (_event, elements) => {
        if (!onSelect || !elements.length) return;
        const { index } = elements[0];
        if (!model.slices[index]?.selectable) return;
        if (touch.matches && armed !== index) {
          armed = index;
          return;
        }
        armed = null;
        onSelect(model.slices[index]);
      },
      onHover: (event, elements) => {
        if (!onSelect) return;
        const slice = elements.length ? model.slices[elements[0].index] : null;
        event.native.target.style.cursor = slice?.selectable ? 'pointer' : 'default';
      },
    },
  });

  function update(next) {
    model = next;
    armed = null;
    const colors = next.slices.map(resolveColor);
    chart.data.labels = next.slices.map((slice) => slice.label);
    chart.data.datasets = [{
      data: next.slices.map((slice) => slice.total),
      backgroundColor: colors,
      hoverBackgroundColor: colors,
      // A surface-colored gap separates the slices.
      borderColor: cssVar('--surface'),
      hoverBorderColor: cssVar('--surface'),
      borderWidth: next.slices.length > 1 ? 2 : 0,
      hoverOffset: 4,
    }];
    chart.update();
  }

  return { update, destroy: () => chart.destroy() };
}
