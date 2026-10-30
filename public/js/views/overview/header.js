import { html, render, collectRefs } from '../../lib/html.js';
import { icon } from '../../lib/icons.js';
import { formatRange } from '../../lib/format.js';
import { PRESETS } from '../../lib/periods.js';
import { watch } from '../../state/store.js';
import { selectOverview } from '../../state/selectors.js';
import { OVERVIEW_KEYS, isOverviewVisible } from './keys.js';

export function mountOverviewHeader(element, store, actions) {
  render(element, html`
    <div class="view-heading">
      <h1 class="view-title">Panoramica</h1>
      <p class="view-sub" data-ref="sub"></p>
    </div>
    <div class="segmented" role="group" aria-label="Flusso da analizzare">
      <button type="button" class="segmented-btn" data-flow="expense" aria-pressed="true">Uscite</button>
      <button type="button" class="segmented-btn" data-flow="income" aria-pressed="false">Entrate</button>
    </div>
    <div class="filter-chips" data-ref="chips" hidden></div>`);
  const refs = collectRefs(element);

  element.addEventListener('click', (event) => {
    const button = event.target.closest('[data-flow]');
    if (button) actions.setFlow(button.dataset.flow);
    if (event.target.closest('[data-action="undo-zoom"]')) actions.undoZoom();
    if (event.target.closest('[data-action="clear-focus"]')) actions.focusCategory(null);
  });

  // Whatever narrows the view beyond the period stays visible at the top, removable with one tap.
  watch(store, ['route', 'status', 'zoomFrom', 'focusCategory'], (state) => {
    if (!isOverviewVisible(state)) return;
    const { zoomFrom, focusCategory } = state;
    const from = zoomFrom && (PRESETS.find((preset) => preset.id === zoomFrom.preset)?.label ?? formatRange(zoomFrom));
    refs.chips.hidden = !zoomFrom && !focusCategory;
    render(refs.chips, html`
      ${zoomFrom ? html`<button type="button" class="chip" data-action="undo-zoom">${icon('arrow-left', { size: 14 })}Torna a ${from}</button>` : ''}
      ${focusCategory ? html`<button type="button" class="chip chip-filter" data-action="clear-focus" aria-label="Togli il filtro: categoria ${focusCategory}">
        <span class="truncate">Categoria: <strong>${focusCategory}</strong></span>${icon('x', { size: 14 })}</button>` : ''}`);
  });

  watch(store, OVERVIEW_KEYS, (state) => {
    if (!isOverviewVisible(state)) return;
    const { range, compare } = selectOverview(state);
    refs.sub.textContent = compare
      ? `${formatRange(range)} · confronto con ${formatRange(compare)}`
      : formatRange(range);
    for (const button of element.querySelectorAll('[data-flow]')) {
      button.setAttribute('aria-pressed', String(button.dataset.flow === state.flow));
    }
  });
}
