import { html, render, collectRefs } from '../../lib/html.js';
import { mountOverviewHeader } from './header.js';
import { mountSummary } from './summary.js';
import { mountTrendPanel } from './trend-panel.js';
import { mountCategoryPanel } from './category-panel.js';
import { mountCashflowPanel } from './cashflow-panel.js';
import { mountTopPanel } from './top-panel.js';

export function mountOverview(element, store, actions) {
  render(element, html`
    <header class="view-head" data-ref="header"></header>
    <section class="panel summary" data-ref="summary" aria-label="Riepilogo del periodo"></section>
    <div class="grid grid-main">
      <section class="panel" data-ref="trend"></section>
      <section class="panel" data-ref="categories"></section>
    </div>
    <div class="grid grid-secondary">
      <section class="panel" data-ref="cashflow"></section>
      <section class="panel" data-ref="top"></section>
    </div>`);

  const refs = collectRefs(element);
  mountOverviewHeader(refs.header, store, actions);
  mountSummary(refs.summary, store, actions);
  mountTrendPanel(refs.trend, store, actions);
  mountCategoryPanel(refs.categories, store, actions);
  mountCashflowPanel(refs.cashflow, store, actions);
  mountTopPanel(refs.top, store, actions);
}
