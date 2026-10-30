import { html, render } from '../../lib/html.js';
import { diffDays, minISO, todayISO } from '../../lib/dates.js';
import { formatCount, formatEUR, formatSignedEUR } from '../../lib/format.js';
import { relativeChange } from '../../lib/aggregate.js';
import { watch } from '../../state/store.js';
import { selectOverview } from '../../state/selectors.js';
import { delta } from '../../components/common.js';
import { OVERVIEW_KEYS, isOverviewVisible } from './keys.js';

const elapsedDays = (range) => Math.max(1, diffDays(range.from, minISO(range.to, todayISO())) + 1);

function figure({ label, value, detail, emphasis = false }) {
  return html`<div class="figure${emphasis ? ' figure-main' : ''}">
    <dt class="figure-label">${label}</dt>
    <dd class="figure-value num">${value}</dd>
    <dd class="figure-detail">${detail}</dd>
  </div>`;
}

export function mountSummary(element, store) {
  watch(store, OVERVIEW_KEYS, (state) => {
    if (!isOverviewVisible(state)) return;
    const { range, compare, totals: now, previousTotals: before } = selectOverview(state);
    const change = (key) => (before ? relativeChange(now[key], before[key]) : null);
    const days = elapsedDays(range);
    const previousDaily = compare && before ? before.expense / elapsedDays(compare) : null;

    render(element, html`
      <dl class="figures">
        ${figure({ label: 'Uscite', value: formatEUR(now.expense), detail: delta(change('expense')), emphasis: state.flow === 'expense' })}
        ${figure({ label: 'Entrate', value: formatEUR(now.income), detail: delta(change('income')), emphasis: state.flow === 'income' })}
        ${figure({
          label: 'Saldo',
          value: formatSignedEUR(now.net),
          detail: delta(before ? now.net - before.net : null, { absolute: true }),
        })}
        ${figure({
          label: 'Spesa media al giorno',
          value: formatEUR(now.expense / days),
          detail: delta(previousDaily ? relativeChange(now.expense / days, previousDaily) : null),
        })}
      </dl>
      <p class="figures-note">
        ${state.focusCategory ? 'Totali di tutte le categorie · ' : ''}${formatCount(now.count)} movimenti nel periodo${now.transfer ? html` · giroconti tra i tuoi conti per <span class="num">${formatEUR(now.transfer)}</span>, esclusi dai totali` : ''}
      </p>`);
  });
}
