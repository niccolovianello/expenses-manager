import { html } from '../lib/html.js';
import { icon } from '../lib/icons.js';
import { formatCount, formatEUR, formatSignedEUR, formatSignedPercent } from '../lib/format.js';

export const swatch = (colorVar) => html`<span class="swatch" style="--swatch: var(${colorVar})" aria-hidden="true"></span>`;

export function legend(series) {
  return series.map((item) => html`<li class="legend-item">${swatch(item.colorVar)}<span>${item.label}</span></li>`);
}

// Change versus the previous period: the arrow gives the direction, the color stays neutral
// (red and green are reserved for expenses and income). `absolute` shows a difference in euros.
export function delta(change, { reference = 'periodo prec.', absolute = false } = {}) {
  if (change === null || !Number.isFinite(change)) {
    return html`<span class="delta delta-none">Nessun confronto</span>`;
  }
  const flat = Math.abs(change) < (absolute ? 0.5 : 0.005);
  // Beyond +1000% the percentage is meaningless (near-empty base): show the multiple instead, "×13".
  const value = flat ? 'invariato'
    : absolute ? formatSignedEUR(change)
      : change >= 10 ? `×${formatCount(Math.round(change + 1))}` : formatSignedPercent(change);
  return html`<span class="delta${flat ? ' delta-none' : ''}">
    ${flat ? '' : icon(change > 0 ? 'trend-up' : 'trend-down', { size: 14 })}
    <span class="num">${value}</span>
    <span class="delta-ref">vs ${reference}</span>
  </span>`;
}

// Table alternative to the chart: one row per interval, one column per series.
export function seriesTable({ caption, titles, series, showTotal = true }) {
  const rowTotal = (index) => series.reduce((sum, item) => sum + item.data[index], 0);
  return html`<div class="table-scroll"><table class="data-table">
    <caption class="sr-only">${caption}</caption>
    <thead><tr>
      <th scope="col">Periodo</th>
      ${series.map((item) => html`<th scope="col" class="num">${item.label}</th>`)}
      ${showTotal && series.length > 1 ? html`<th scope="col" class="num">Totale</th>` : ''}
    </tr></thead>
    <tbody>${titles.map((title, index) => html`<tr>
      <th scope="row">${title}</th>
      ${series.map((item) => html`<td class="num">${item.data[index] ? formatEUR(item.data[index]) : '—'}</td>`)}
      ${showTotal && series.length > 1 ? html`<td class="num strong">${formatEUR(rowTotal(index))}</td>` : ''}
    </tr>`)}</tbody>
  </table></div>`;
}

export function emptyState({ title, body, actionLabel, action }) {
  return html`<div class="empty-state">
    <p class="empty-title">${title}</p>
    ${body ? html`<p class="empty-body">${body}</p>` : ''}
    ${actionLabel ? html`<button type="button" class="btn btn-secondary btn-sm" data-empty-action="${action}">${actionLabel}</button>` : ''}
  </div>`;
}
