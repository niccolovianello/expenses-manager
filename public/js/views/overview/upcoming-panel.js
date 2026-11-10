import { html, render, collectRefs } from '../../lib/html.js';
import { icon } from '../../lib/icons.js';
import { addDays, parseISO, todayISO } from '../../lib/dates.js';
import { describeTransaction, signedAmount } from '../../lib/aggregate.js';
import { formatDate, formatEUR, formatSignedEUR } from '../../lib/format.js';
import { remainingRange } from '../../lib/periods.js';
import { FREQUENCIES, nextOccurrence, occurrencesBetween } from '../../domain/recurring.js';
import { watch } from '../../state/store.js';
import { emptyState } from '../../components/common.js';
import { OVERVIEW_KEYS, isOverviewVisible } from './keys.js';

const weekday = new Intl.DateTimeFormat('it-IT', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
const capitalize = (text) => text.charAt(0).toUpperCase() + text.slice(1);

const SUBTITLES = {
  today: (range) => `Domani, ${formatDate(range.to)}`,
  week: (range) => `Da domani a domenica ${formatDate(range.to)}`,
  month: (range) => `Da domani al ${formatDate(range.to)}`,
};
const EMPTY = { today: 'Nessun ricorrente domani', week: 'Nessun altro ricorrente entro domenica', month: 'Nessun altro ricorrente entro fine mese' };

// "Domani", else "mar 17 nov".
const dayLabel = (date, today) => (date === addDays(today, 1) ? 'domani' : weekday.format(parseISO(date)));

const touches = (recurrence, account) =>
  account === 'all' || recurrence.account === account || recurrence.toAccount === account;

function row({ recurrence: r, dates }, today) {
  const total = r.amount * dates.length;
  const amount = r.kind === 'transfer' ? formatEUR(total) : formatSignedEUR(signedAmount({ ...r, amount: total }));
  const first = dayLabel(dates[0], today);
  const when = dates.length === 1
    ? `${capitalize(first)} · ${FREQUENCIES[r.frequency]}`
    : `Da ${first} · ${dates.length} × ${formatEUR(r.amount)}`;
  return html`<li>
    <button type="button" class="recurring-row" data-recurrence="${r.id}">
      <span class="recurring-mark" aria-hidden="true">${icon('repeat')}</span>
      <span class="recurring-main">
        <span class="cell-title truncate">${describeTransaction({ ...r, category: r.sourceCategory })}</span>
        <span class="cell-sub">${when}</span>
      </span>
      <span class="recurring-account truncate">${r.toAccount ? html`${r.account} ${icon('arrow-right', { size: 12 })} ${r.toAccount}` : r.account}</span>
      <span class="num strong amount-${r.kind}">${amount}</span>
      <span class="sr-only">, modifica la ricorrenza</span>
    </button>
  </li>`;
}

// On "Oggi", "Questa settimana" and "Questo mese": the recurring movements still to come before the
// period ends, one row per recurrence. It opens and closes from its heading (closed on the phone,
// where categories come first); the amounts still to come stay in view either way.
export function mountUpcomingPanel(element, store, actions) {
  render(element, html`
    <header class="panel-head">
      <div>
        <h2 class="panel-heading" id="upcoming-title">
          <button type="button" class="disclosure-btn" data-action="toggle" aria-expanded="true" aria-controls="upcoming-body">
            ${icon('chevron-down', { size: 16 })}<span class="panel-title">Ricorrenti in arrivo</span> <span class="disclosure-count" data-ref="count"></span>
          </button>
        </h2>
        <p class="panel-sub" data-ref="sub"></p>
      </div>
      <dl class="upcoming-totals" data-ref="totals"></dl>
    </header>
    <div class="upcoming-body" id="upcoming-body" data-ref="body"></div>`);
  element.setAttribute('aria-labelledby', 'upcoming-title');

  const refs = collectRefs(element);
  let open = !window.matchMedia('(max-width: 860px)').matches;
  const toggle = element.querySelector('[data-action="toggle"]');
  const syncOpen = () => {
    toggle.setAttribute('aria-expanded', String(open));
    refs.body.hidden = !open;
    refs.sub.hidden = !open;
  };
  syncOpen();

  element.addEventListener('click', (event) => {
    if (event.target.closest('[data-action="toggle"]')) {
      open = !open;
      return syncOpen();
    }
    const id = event.target.closest('[data-recurrence]')?.dataset.recurrence;
    const recurrence = store.get().recurrences.find((r) => r.id === id);
    if (recurrence) actions.openEntryForm(recurrence, { recurring: true });
  });

  watch(store, [...OVERVIEW_KEYS, 'recurrences'], (state) => {
    const today = todayISO();
    const range = remainingRange(state.period, today);
    const active = state.recurrences.filter((r) => touches(r, state.account) && nextOccurrence(r, today));
    element.hidden = !range || !active.length;
    if (element.hidden || !isOverviewVisible(state)) return;

    const upcoming = occurrencesBetween(active, range);
    const sum = (kind) => upcoming
      .filter(({ recurrence }) => recurrence.kind === kind)
      .reduce((total, { recurrence, dates }) => total + recurrence.amount * dates.length, 0);
    const expense = sum('expense');
    const income = sum('income');
    const preset = state.period.preset;

    refs.count.textContent = upcoming.length ? `· ${upcoming.length}` : '';
    refs.sub.textContent = SUBTITLES[preset](range);
    render(refs.totals, html`
      ${expense ? html`<div><dt>Ancora in uscita</dt><dd class="num">${formatEUR(expense)}</dd></div>` : ''}
      ${income ? html`<div><dt>Ancora in entrata</dt><dd class="num amount-income">${formatEUR(income)}</dd></div>` : ''}`);
    render(refs.body, upcoming.length
      ? html`<ul class="recurring-list">${upcoming.map((item) => row(item, today))}</ul>`
      : emptyState({ title: EMPTY[preset] }));
  });
}
