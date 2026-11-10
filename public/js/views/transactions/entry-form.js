import { ENTRY_KINDS, entryInput, normalizeEntry } from '../../domain/entries.js';
import { FREQUENCIES, normalizeRecurrence, recurrenceInput } from '../../domain/recurring.js';
import { html, render, collectRefs } from '../../lib/html.js';
import { icon } from '../../lib/icons.js';
import { todayISO } from '../../lib/dates.js';
import { watch } from '../../state/store.js';
import { selectCategories } from '../../state/selectors.js';
import { askInline } from '../../components/confirm.js';
import { fillCategorySelect, handleNewCategory } from './new-category.js';

const FIELDS = ['date', 'amount', 'account', 'toAccount', 'category', 'tag', 'comment', 'frequency', 'endDate'];
const formatAmountInput = (amount) => (amount ? amount.toFixed(2).replace('.', ',') : '');

// The required fields still empty, all at once, so one submit says everything that is missing.
const REQUIRED_NAMES = { amount: 'importo', account: 'conto', toAccount: 'conto di arrivo', category: 'categoria' };
function missingFields(input) {
  const required = input.kind === 'transfer' ? ['amount', 'account', 'toAccount'] : ['amount', 'account', 'category'];
  return required.filter((name) => !String(input[name] ?? '').trim());
}
const listNames = (names) => (names.length > 1 ? `${names.slice(0, -1).join(', ')} e ${names.at(-1)}` : names[0]);

// Form to enter or edit a transaction by hand, once or repeating from a base date. It stays open after
// saving a new one-off transaction, with kind, date, account and category ready for the next one.
export function mountEntryForm(element, store, actions) {
  render(element, html`
    <header class="panel-head">
      <div>
        <h2 class="panel-title" data-ref="title"></h2>
        <p class="panel-sub">Resta salvato anche quando importi un nuovo export.</p>
      </div>
      <button type="button" class="icon-btn" data-ref="close" aria-label="Chiudi il modulo">${icon('x')}</button>
    </header>
    <form class="entry-form" data-ref="form" novalidate>
      <div class="segmented" role="group" aria-label="Tipo di movimento">
        ${Object.entries(ENTRY_KINDS).map(([kind, label]) => html`<button type="button" class="segmented-btn" data-kind="${kind}" aria-pressed="false">${label}</button>`)}
      </div>
      <div class="entry-fields">
        <label class="field"><span class="field-label" data-ref="dateLabel">Data</span><input class="input" type="date" name="date" required></label>
        <label class="field" data-ref="frequencyField"><span class="field-label">Ripetizione</span><select class="input" name="frequency" data-ref="frequency"></select></label>
        <label class="field" data-ref="endDateField"><span class="field-label">Fino al <span class="field-optional">facoltativo</span></span><input class="input" type="date" name="endDate"></label>
        <label class="field"><span class="field-label">Importo (€)</span><input class="input input-amount" name="amount" inputmode="decimal" placeholder="0,00" autocomplete="off" required></label>
        <label class="field"><span class="field-label" data-ref="accountLabel">Conto</span><select class="input" name="account" required></select></label>
        <label class="field" data-ref="toAccountField"><span class="field-label">Al conto</span><select class="input" name="toAccount"></select></label>
        <label class="field" data-ref="categoryField"><span class="field-label">Categoria</span><select class="input" name="category" data-ref="category"></select></label>
        <label class="field"><span class="field-label">Tag <span class="field-optional">facoltativo</span></span><input class="input" name="tag" autocomplete="off" maxlength="60"></label>
        <label class="field field-full"><span class="field-label">Descrizione <span class="field-optional">facoltativa</span></span><input class="input" name="comment" autocomplete="off" maxlength="200" placeholder="es. Cena con amici"></label>
      </div>
      <p class="field-hint" data-ref="noAccounts" hidden>Non hai ancora conti: <a href="#/conti">creane uno nella sezione Conti</a>, poi torna qui.</p>
      <span class="field-error" id="entry-error" data-ref="error" role="alert" hidden></span>
      <div class="form-actions" data-ref="actions">
        <button type="submit" class="btn btn-primary" data-ref="submit"></button>
        <button type="button" class="btn btn-ghost" data-ref="cancel">Annulla</button>
        <button type="button" class="btn btn-ghost btn-danger" data-ref="remove" hidden>${icon('trash')}Elimina</button>
      </div>
    </form>`);

  const refs = collectRefs(element);
  const fields = refs.form.elements;
  let kind = 'expense';
  let editingId = null;
  // 'entry': a one-off transaction being edited; 'recurrence': a recurring one; null: a new one, either.
  let editing = null;
  let saving = false;
  let lastToken = null;

  function setKind(next) {
    kind = next;
    for (const button of element.querySelectorAll('[data-kind]')) {
      button.setAttribute('aria-pressed', String(button.dataset.kind === kind));
    }
    const isTransfer = kind === 'transfer';
    refs.toAccountField.hidden = !isTransfer;
    refs.categoryField.hidden = isTransfer;
    refs.accountLabel.textContent = isTransfer ? 'Dal conto' : 'Conto';
    syncOptions(store.get());
  }

  // A repeating transaction starts on the base date and can have an end.
  function syncFrequency() {
    const repeats = Boolean(fields.frequency.value);
    refs.dateLabel.textContent = repeats ? 'A partire dal' : 'Data';
    refs.endDateField.hidden = !repeats;
    if (!repeats) fields.endDate.value = '';
  }

  // Only the accounts of the Conti section; an older transaction keeps its account even if it is not there.
  function fillAccounts(select, names, value) {
    const options = value && !names.includes(value) ? [...names, value] : names;
    render(select, html`<option value="">Scegli un conto</option>${options.map((name) => html`<option value="${name}">${name}</option>`)}`);
    select.value = value;
  }

  function syncOptions(state) {
    const names = state.accounts.map((account) => account.name);
    fillAccounts(fields.account, names, fields.account.value);
    fillAccounts(fields.toAccount, names, fields.toAccount.value);
    refs.noAccounts.hidden = names.length > 0;
    const categories = kind === 'transfer' ? [] : selectCategories(state)[kind];
    fillCategorySelect(refs.category, categories, refs.category.value);
  }

  // The error appears under the field to fix, which is marked and focused. With several fields
  // (`also`), all of them are marked and the message, under the first one, names each.
  function showError(message, field = null, also = []) {
    for (const input of refs.form.querySelectorAll('[aria-invalid]')) {
      input.removeAttribute('aria-invalid');
      input.removeAttribute('aria-describedby');
    }
    refs.error.textContent = message ?? '';
    refs.error.hidden = !message;
    const isField = (name) => fields[name] instanceof HTMLInputElement || fields[name] instanceof HTMLSelectElement;
    const input = message && field && isField(field) ? fields[field] : null;
    if (!input) return refs.actions.before(refs.error);
    for (const name of [field, ...also].filter(isField)) {
      fields[name].setAttribute('aria-invalid', 'true');
      fields[name].setAttribute('aria-describedby', 'entry-error');
    }
    input.closest('.field').append(refs.error);
    input.focus();
  }

  // `recurring`: the entry is a recurrence, or the new transaction starts as a monthly one.
  function open(entry, recurring = false) {
    editingId = entry?.id ?? null;
    editing = entry ? (recurring ? 'recurrence' : 'entry') : null;
    const values = entry ? (recurring ? recurrenceInput(entry) : entryInput(entry)) : { date: todayISO(), frequency: recurring ? 'monthly' : '' };
    // An existing transaction stays one-off or recurring: only how often it repeats can change.
    const frequencies = Object.entries(editing === 'recurrence' ? FREQUENCIES : { '': 'Non si ripete', ...FREQUENCIES });
    render(refs.frequency, frequencies.map(([value, label]) => html`<option value="${value}">${label}</option>`));
    refs.frequencyField.hidden = editing === 'entry';
    // The account selects get their options (and the value) from syncOptions, called by setKind.
    for (const name of ['account', 'toAccount', 'category']) render(fields[name], html`<option value="${values[name] ?? ''}"></option>`);
    for (const name of FIELDS) fields[name].value = values[name] ?? '';
    fields.amount.value = formatAmountInput(values.amount);
    syncFrequency();
    refs.title.textContent = editing === 'recurrence' ? 'Modifica movimento ricorrente' : editingId ? 'Modifica movimento' : 'Nuovo movimento';
    render(refs.submit, editingId ? html`Salva modifiche` : html`${icon('plus')}Aggiungi`);
    refs.remove.hidden = !editingId;
    showError(null);
    setKind(values.kind ?? 'expense');
    snapshot = JSON.stringify(readForm());
    element.hidden = false;
    pendingFocus = true;
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

  // The form also opens from other sections: it is focused once the view is visible.
  let pendingFocus = false;
  function focusWhenVisible(state) {
    if (!pendingFocus || state.route !== 'transactions') return;
    pendingFocus = false;
    requestAnimationFrame(() => {
      element.scrollIntoView({ block: 'start' });
      fields.amount.focus({ preventScroll: true });
    });
  }

  function close() {
    element.querySelector('.confirm-strip [data-answer="no"]')?.click();
    element.hidden = true;
    editingId = null;
    editing = null;
  }

  const readForm = () => ({ kind, ...Object.fromEntries(FIELDS.map((name) => [name, fields[name].value])) });

  element.addEventListener('click', (event) => {
    const kindButton = event.target.closest('[data-kind]');
    if (!kindButton || kindButton.dataset.kind === kind) return;
    // An expense category is not an income one: switching kind keeps only a category the new kind has.
    const next = kindButton.dataset.kind;
    if (next !== 'transfer' && !selectCategories(store.get())[next].includes(refs.category.value)) refs.category.value = '';
    setKind(next);
  });
  refs.close.addEventListener('click', close);
  refs.cancel.addEventListener('click', close);
  refs.form.addEventListener('input', () => showError(null));
  refs.frequency.addEventListener('change', syncFrequency);
  handleNewCategory(refs.category, () => showError(null));
  refs.form.addEventListener('keydown', async (event) => {
    if (event.key !== 'Escape' || event.defaultPrevented || asking) return;
    if (!isDirty()) return close();
    const discard = await ask({ message: 'Chiudere senza salvare?', detail: 'Quello che hai scritto andrà perso.', confirmLabel: 'Chiudi senza salvare', danger: true });
    if (discard) close();
  });

  refs.remove.addEventListener('click', async () => {
    if (!editingId) return;
    if (editing === 'recurrence') {
      const confirmed = await ask({
        message: 'Eliminare questo movimento ricorrente?',
        detail: 'Spariscono anche tutte le volte già passate. Per fermarlo e tenerne lo storico, imposta invece una data “Fino al”.',
        confirmLabel: 'Elimina',
        danger: true,
      });
      if (confirmed && await actions.deleteRecurrence(editingId)) close();
      return;
    }
    const confirmed = await ask({ message: 'Eliminare questo movimento inserito a mano?', confirmLabel: 'Elimina', danger: true });
    if (confirmed && await actions.deleteEntry(editingId)) close();
  });

  refs.form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (saving) return;
    const input = readForm();
    const missing = missingFields(input);
    if (missing.length > 1) {
      return showError(`Mancano ${listNames(missing.map((name) => REQUIRED_NAMES[name]))}`, missing[0], missing.slice(1));
    }
    const recurring = Boolean(input.frequency);
    const { error, field } = recurring ? normalizeRecurrence(input) : normalizeEntry(input);
    if (error) return showError(error, field);

    saving = true;
    refs.submit.disabled = true;
    const saved = recurring ? await actions.saveRecurrence(editingId, input) : await actions.saveEntry(editingId, input);
    saving = false;
    refs.submit.disabled = false;
    if (!saved) return;

    if (editingId || recurring) return close();
    // Ready for the next one: only amount and details are cleared.
    for (const name of ['amount', 'tag', 'comment']) fields[name].value = '';
    snapshot = JSON.stringify(readForm());
    fields.amount.focus();
  });

  watch(store, ['entryDraft', 'transactions', 'config', 'accounts', 'route'], (state) => {
    if (state.entryDraft && state.entryDraft.token !== lastToken) {
      lastToken = state.entryDraft.token;
      open(state.entryDraft.entry, state.entryDraft.recurring);
    } else if (!element.hidden) {
      syncOptions(state);
    }
    focusWhenVisible(state);
  });
}
