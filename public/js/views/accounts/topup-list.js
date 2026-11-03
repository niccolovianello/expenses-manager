import { html, render, collectRefs } from '../../lib/html.js';
import { icon } from '../../lib/icons.js';
import { todayISO } from '../../lib/dates.js';
import { formatDate, formatEUR } from '../../lib/format.js';
import { nextTopUp } from '../../domain/topups.js';
import { watch } from '../../state/store.js';
import { describeSchedule } from './topup-form.js';

// The automatic top-ups, with when the next one happens; ended ones last. Tapping one opens it in the form.
export function mountTopUpList(element, store, actions) {
  render(element, html`
    <header class="panel-head">
      <div>
        <h2 class="panel-title">Ricariche automatiche</h2>
        <p class="panel-sub">Riportano un conto a una cifra prendendo da un altro quello che manca, come il budget settimanale di Satispay. Ogni ricarica è tra i movimenti e aggiorna i saldi.</p>
      </div>
      <button type="button" class="btn btn-secondary btn-sm" data-action="new-topup">${icon('plus')}Nuova ricarica</button>
    </header>
    <ul class="recurring-list" data-ref="list"></ul>`);

  const refs = collectRefs(element);

  element.addEventListener('click', (event) => {
    if (event.target.closest('[data-action="new-topup"]')) return actions.openTopUpForm();
    const id = event.target.closest('[data-topup]')?.dataset.topup;
    const topUp = store.get().topUps.find((t) => t.id === id);
    if (topUp) actions.openTopUpForm(topUp);
  });

  watch(store, ['status', 'route', 'topUps', 'accounts'], (state) => {
    element.hidden = !state.accounts.length;
    if (state.status !== 'ready' || state.route !== 'accounts') return;
    const today = todayISO();
    const rows = state.topUps.map((t) => ({ ...t, next: nextTopUp(t, today) }))
      .sort((a, b) => (a.next ?? '9999').localeCompare(b.next ?? '9999'));
    render(refs.list, rows.map((t) => {
      const when = t.next
        ? `${describeSchedule(t)} · prossima ${formatDate(t.next)}${t.endDate ? ` · fino al ${formatDate(t.endDate)}` : ''}`
        : `terminata il ${formatDate(t.endDate)}`;
      return html`<li>
        <button type="button" class="recurring-row${t.next ? '' : ' is-ended'}" data-topup="${t.id}" aria-label="Modifica la ricarica di ${t.toAccount}">
          <span class="recurring-mark" aria-hidden="true">${icon('refresh')}</span>
          <span class="recurring-main">
            <span class="cell-title truncate">Ricarica di ${t.toAccount}</span>
            <span class="cell-sub">${when.charAt(0).toLocaleUpperCase('it') + when.slice(1)}</span>
          </span>
          <span class="recurring-account truncate">${t.account} ${icon('arrow-right', { size: 12 })} ${t.toAccount}</span>
          <span class="num strong">${formatEUR(t.target)}</span>
        </button>
      </li>`;
    }));
  });
}
