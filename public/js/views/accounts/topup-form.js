import { FREQUENCIES } from '../../domain/recurring.js';
import { normalizeTopUp, topUpInput } from '../../domain/topups.js';
import { addDays, parseISO, startOfWeek, todayISO } from '../../lib/dates.js';
import { formatEUR } from '../../lib/format.js';
import { askInline } from '../../components/confirm.js';
import { html, render, collectRefs } from '../../lib/html.js';
import { icon } from '../../lib/icons.js';
import { watch } from '../../state/store.js';

const FIELDS = ['toAccount', 'account', 'target', 'frequency', 'date', 'endDate'];
const formatAmountInput = (amount) => (amount ? amount.toFixed(2).replace('.', ',') : '');
const weekday = new Intl.DateTimeFormat('it-IT', { weekday: 'long', timeZone: 'UTC' });

// "ogni lunedì", "ogni mese il giorno 5": when the top-up happens, from its first date.
export function describeSchedule({ frequency, date }) {
  if (frequency === 'daily') return 'ogni giorno';
  if (frequency === 'weekly') return `ogni ${weekday.format(parseISO(date))}`;
  if (frequency === 'monthly') return `ogni mese il giorno ${Number(date.slice(8))}`;
  return 'ogni anno';
}

// Form to create or edit an automatic top-up: which account to bring back to which amount,
// from which account, and how often.
export function mountTopUpForm(element, store, actions) {
  render(element, html`
    <header class="panel-head">
      <div>
        <h2 class="panel-title" data-ref="title"></h2>
        <p class="panel-sub">Ogni volta prende dal conto di appoggio quello che manca per arrivare alla cifra. Se il conto ha già abbastanza, non prende niente.</p>
      </div>
      <button type="button" class="icon-btn" data-ref="close" aria-label="Chiudi il modulo">${icon('x')}</button>
    </header>
    <form class="entry-form" data-ref="form" novalidate>
      <div class="entry-fields">
        <label class="field"><span class="field-label">Conto da ricaricare</span><select class="input" name="toAccount" required></select></label>
        <label class="field"><span class="field-label">Cifra da raggiungere (€)</span><input class="input input-amount" name="target" inputmode="decimal" placeholder="0,00" autocomplete="off" required></label>
        <label class="field"><span class="field-label">Prende dal conto</span><select class="input" name="account" required></select></label>
        <label class="field"><span class="field-label">Ripetizione</span><select class="input" name="frequency">${Object.entries(FREQUENCIES).map(([value, label]) => html`<option value="${value}">${label}</option>`)}</select></label>
        <label class="field"><span class="field-label">A partire dal</span><input class="input" type="date" name="date" required></label>
        <label class="field"><span class="field-label">Fino al <span class="field-optional">facoltativo</span></span><input class="input" type="date" name="endDate"></label>
      </div>
      <p class="field-hint" data-ref="summary"></p>
      <span class="field-error" id="topup-error" data-ref="error" role="alert" hidden></span>
      <div class="form-actions" data-ref="actions">
        <button type="submit" class="btn btn-primary" data-ref="submit"></button>
        <button type="button" class="btn btn-ghost" data-ref="cancel">Annulla</button>
        <button type="button" class="btn btn-ghost btn-danger" data-ref="remove" hidden>${icon('trash')}Elimina</button>
      </div>
    </form>`);

  const refs = collectRefs(element);
  const fields = refs.form.elements;
  let editing = null;
  let saving = false;
  let lastToken = null;

  function fillAccounts(select, names, value) {
    const options = value && !names.includes(value) ? [...names, value] : names;
    render(select, html`<option value="">Scegli un conto</option>${options.map((name) => html`<option value="${name}">${name}</option>`)}`);
    select.value = value ?? '';
  }

  function syncAccounts(state) {
    const names = state.accounts.map((account) => account.name);
    fillAccounts(fields.toAccount, names, fields.toAccount.value);
    fillAccounts(fields.account, names, fields.account.value);
  }

  // The rule in words, so what will happen is clear before saving.
  function syncSummary() {
    const { topUp } = normalizeTopUp(readForm());
    refs.summary.textContent = topUp
      ? `${describeSchedule(topUp).replace(/^o/, 'O')} riporta ${topUp.toAccount} a ${formatEUR(topUp.target)} prendendo da ${topUp.account} quello che manca.`
      : '';
  }

  function showError(message, field = null) {
    for (const input of refs.form.querySelectorAll('[aria-invalid]')) {
      input.removeAttribute('aria-invalid');
      input.removeAttribute('aria-describedby');
    }
    refs.error.textContent = message ?? '';
    refs.error.hidden = !message;
    const input = message && field ? fields[field] : null;
    if (!(input instanceof HTMLInputElement || input instanceof HTMLSelectElement)) return refs.actions.before(refs.error);
    input.setAttribute('aria-invalid', 'true');
    input.setAttribute('aria-describedby', 'topup-error');
    input.closest('.field').append(refs.error);
    input.focus();
  }

  // A new top-up starts weekly, on the next Monday.
  function open(topUp) {
    editing = topUp;
    const values = topUp ? topUpInput(topUp) : { frequency: 'weekly', date: addDays(startOfWeek(todayISO()), 7) };
    for (const name of ['toAccount', 'account']) render(fields[name], html`<option value="${values[name] ?? ''}"></option>`);
    for (const name of FIELDS) fields[name].value = values[name] ?? '';
    fields.target.value = formatAmountInput(values.target);
    syncAccounts(store.get());
    syncSummary();
    refs.title.textContent = topUp ? 'Modifica ricarica automatica' : 'Nuova ricarica automatica';
    render(refs.submit, topUp ? html`Salva modifiche` : html`${icon('plus')}Aggiungi`);
    refs.remove.hidden = !topUp;
    showError(null);
    snapshot = JSON.stringify(readForm());
    element.hidden = false;
    pendingFocus = true;
  }

  // The form also opens from the movements: it is focused once the view is visible.
  let pendingFocus = false;
  function focusWhenVisible(state) {
    if (!pendingFocus || state.route !== 'accounts') return;
    pendingFocus = false;
    requestAnimationFrame(() => {
      element.scrollIntoView({ block: 'start', behavior: 'smooth' });
      (editing ? fields.target : fields.toAccount).focus({ preventScroll: true });
    });
  }

  function close() {
    element.querySelector('.confirm-strip [data-answer="no"]')?.click();
    element.hidden = true;
    editing = null;
  }

  // What the form held when it opened: Escape asks before throwing away anything typed since.
  let snapshot = '';
  const isDirty = () => !element.hidden && JSON.stringify(readForm()) !== snapshot;
  let asking = false;
  async function ask(options) {
    if (asking) return false;
    asking = true;
    const answer = await askInline(refs.actions, options);
    asking = false;
    return answer;
  }

  const readForm = () => Object.fromEntries(FIELDS.map((name) => [name, fields[name].value]));

  refs.close.addEventListener('click', close);
  refs.cancel.addEventListener('click', close);
  refs.form.addEventListener('input', () => {
    showError(null);
    syncSummary();
  });
  refs.form.addEventListener('keydown', async (event) => {
    if (event.key !== 'Escape' || asking) return;
    if (!isDirty()) return close();
    const discard = await ask({ message: 'Chiudere senza salvare?', detail: 'Le modifiche alla ricarica andranno perse.', confirmLabel: 'Chiudi senza salvare', danger: true });
    if (discard) close();
  });

  refs.remove.addEventListener('click', async () => {
    if (!editing) return;
    const confirmed = await ask({
      message: 'Eliminare questa ricarica automatica?',
      detail: 'Spariscono anche le ricariche già fatte, e i saldi dei due conti cambiano. Per fermarla e tenerne lo storico, imposta invece una data “Fino al”.',
      confirmLabel: 'Elimina',
      danger: true,
    });
    if (confirmed && await actions.deleteTopUp(editing.id)) close();
  });

  refs.form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (saving) return;
    const input = readForm();
    const { error, field } = normalizeTopUp(input);
    if (error) return showError(error, field);

    saving = true;
    refs.submit.disabled = true;
    const saved = await actions.saveTopUp(editing?.id ?? null, input);
    saving = false;
    refs.submit.disabled = false;
    if (saved) close();
  });

  watch(store, ['topUpDraft', 'accounts', 'route'], (state) => {
    if (state.topUpDraft && state.topUpDraft.token !== lastToken) {
      lastToken = state.topUpDraft.token;
      open(state.topUpDraft.topUp);
    } else if (!element.hidden) {
      syncAccounts(state);
    }
    focusWhenVisible(state);
  });
}
