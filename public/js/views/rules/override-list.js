import { html, render } from '../../lib/html.js';
import { icon } from '../../lib/icons.js';
import { describeTransaction } from '../../lib/aggregate.js';
import { formatCount, formatDate, formatEUR } from '../../lib/format.js';
import { watch } from '../../state/store.js';
import { baselineCategory, selectCategorized } from '../../state/selectors.js';
import { emptyState } from '../../components/common.js';

const VISIBLE = 20;

export function mountOverrideList(element, store, actions) {
  let entries = new Map();

  element.addEventListener('click', (event) => {
    const button = event.target.closest('[data-action="reset"]');
    if (!button) return;
    const tx = entries.get(button.closest('[data-id]').dataset.id);
    if (tx) actions.resetCategory(tx);
  });

  watch(store, ['status', 'config', 'transactions'], (state) => {
    if (state.status !== 'ready') return;
    const manual = selectCategorized(state).filter((tx) => tx.source === 'manual');
    const orphans = Object.keys(state.config.overrides).length - manual.length;
    entries = new Map(manual.map((tx) => [tx.id, tx]));

    render(element, html`
      <header class="panel-head">
        <div>
          <h2 class="panel-title">Correzioni manuali</h2>
          <p class="panel-sub">${manual.length ? `${formatCount(manual.length)} movimenti spostati a mano` : 'Hanno sempre la precedenza sulle regole'}</p>
        </div>
      </header>
      ${manual.length
        ? html`<ul class="override-list">${manual.slice(0, VISIBLE).map((tx) => html`<li data-id="${tx.id}">
            <div class="override-body">
              <span class="cell-title truncate">${describeTransaction(tx)}</span>
              <span class="cell-sub">${formatDate(tx.date)} · ${formatEUR(tx.amount)} · <s>${baselineCategory(state, tx)}</s> ${icon('arrow-right', { size: 12 })} ${tx.category}</span>
            </div>
            <button type="button" class="btn btn-ghost btn-sm" data-action="reset">${icon('undo', { size: 14 })}Ripristina</button>
          </li>`)}</ul>
          ${manual.length > VISIBLE ? html`<p class="panel-foot muted">E altre ${formatCount(manual.length - VISIBLE)}: filtrale in Movimenti con “Solo ricategorizzati”.</p>` : ''}`
        : emptyState({ title: 'Nessuna correzione', body: 'In Movimenti puoi cambiare la categoria di una singola spesa dal suo menu.' })}
      ${orphans > 0 ? html`<p class="panel-foot muted">${orphans} correzioni si riferiscono a movimenti non più presenti nell'export.</p>` : ''}`);
  });
}
