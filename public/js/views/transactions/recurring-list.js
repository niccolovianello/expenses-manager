import { html, render, collectRefs } from '../../lib/html.js';
import { icon } from '../../lib/icons.js';
import { todayISO } from '../../lib/dates.js';
import { describeTransaction, signedAmount } from '../../lib/aggregate.js';
import { formatDate, formatEUR, formatSignedEUR } from '../../lib/format.js';
import { FREQUENCIES, nextOccurrence } from '../../domain/recurring.js';
import { watch } from '../../state/store.js';

const byNext = (a, b) => (a.next ?? '9999').localeCompare(b.next ?? '9999') || describeTransaction(a).localeCompare(describeTransaction(b), 'it');

// The recurring transactions, the next ones first; ended ones last. Tapping one opens it in the form.
export function mountRecurringList(element, store, actions) {
  render(element, html`
    <header class="panel-head">
      <div>
        <h2 class="panel-heading">
          <button type="button" class="disclosure-btn" data-action="toggle-recurring" aria-expanded="true" aria-controls="recurring-body">
            ${icon('chevron-down', { size: 16 })}<span class="panel-title">Movimenti ricorrenti</span> <span class="disclosure-count" data-ref="count"></span>
          </button>
        </h2>
        <p class="panel-sub" data-ref="sub">Ogni ripetizione fino a oggi è tra i movimenti e aggiorna il saldo.</p>
      </div>
      <button type="button" class="btn btn-secondary btn-sm" data-action="new-recurring">${icon('plus')}Nuovo ricorrente</button>
    </header>
    <ul class="recurring-list" id="recurring-body" data-ref="list"></ul>`);

  const refs = collectRefs(element);
  // On the phone the movements come first: the panel starts closed, its heading still says how many.
  let open = !window.matchMedia('(max-width: 860px)').matches;
  const toggle = element.querySelector('[data-action="toggle-recurring"]');
  const syncOpen = () => {
    toggle.setAttribute('aria-expanded', String(open));
    refs.list.hidden = !open;
    refs.sub.hidden = !open;
  };
  syncOpen();

  element.addEventListener('click', (event) => {
    if (event.target.closest('[data-action="toggle-recurring"]')) {
      open = !open;
      return syncOpen();
    }
    if (event.target.closest('[data-action="new-recurring"]')) return actions.openEntryForm(null, { recurring: true });
    const id = event.target.closest('[data-recurrence]')?.dataset.recurrence;
    const recurrence = store.get().recurrences.find((r) => r.id === id);
    if (recurrence) actions.openEntryForm(recurrence, { recurring: true });
  });

  watch(store, ['status', 'route', 'recurrences'], (state) => {
    element.hidden = !state.recurrences.length;
    if (state.status !== 'ready' || state.route !== 'transactions' || !state.recurrences.length) return;
    const today = todayISO();
    const active = state.recurrences.filter((r) => nextOccurrence(r, today)).length;
    refs.count.textContent = `· ${active} ${active === 1 ? 'attivo' : 'attivi'}`;
    const rows = state.recurrences.map((r) => ({ ...r, category: r.sourceCategory, next: nextOccurrence(r, today) })).sort(byNext);
    render(refs.list, rows.map((r) => {
      const when = r.next
        ? `prossimo ${formatDate(r.next)}${r.endDate ? ` · fino al ${formatDate(r.endDate)}` : ''}`
        : `terminato il ${formatDate(r.endDate)}`;
      const amount = r.kind === 'transfer' ? formatEUR(r.amount) : formatSignedEUR(signedAmount(r));
      return html`<li>
        <button type="button" class="recurring-row${r.next ? '' : ' is-ended'}" data-recurrence="${r.id}" aria-label="Modifica ${describeTransaction(r)}">
          <span class="recurring-mark" aria-hidden="true">${icon('repeat')}</span>
          <span class="recurring-main">
            <span class="cell-title truncate">${describeTransaction(r)}</span>
            <span class="cell-sub">${FREQUENCIES[r.frequency]} dal ${formatDate(r.date)} · ${when}</span>
          </span>
          <span class="recurring-account truncate">${r.toAccount ? html`${r.account} ${icon('arrow-right', { size: 12 })} ${r.toAccount}` : r.account}</span>
          <span class="num strong amount-${r.kind}">${amount}</span>
        </button>
      </li>`;
    }));
  });
}
