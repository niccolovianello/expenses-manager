import { html, render, collectRefs } from '../../lib/html.js';
import { formatRange } from '../../lib/format.js';
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
    </div>`);
  const refs = collectRefs(element);

  element.addEventListener('click', (event) => {
    const button = event.target.closest('[data-flow]');
    if (button) actions.setFlow(button.dataset.flow);
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
