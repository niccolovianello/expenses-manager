import { ENTRY_KINDS, entryInput, normalizeEntry } from '../../domain/entries.js';
import { html, render, collectRefs } from '../../lib/html.js';
import { icon } from '../../lib/icons.js';
import { todayISO } from '../../lib/dates.js';
import { watch } from '../../state/store.js';
import { selectAccounts, selectCategories } from '../../state/selectors.js';

const FIELDS = ['date', 'amount', 'account', 'toAccount', 'category', 'tag', 'comment'];
const formatAmountInput = (amount) => (amount ? amount.toFixed(2).replace('.', ',') : '');

// Modulo per inserire o modificare un movimento a mano. Resta aperto dopo il salvataggio
// di un nuovo movimento, con tipo, data, conto e categoria già pronti per il successivo.
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
        <label class="field"><span class="field-label">Data</span><input class="input" type="date" name="date" required></label>
        <label class="field"><span class="field-label">Importo (€)</span><input class="input input-amount" name="amount" inputmode="decimal" placeholder="0,00" autocomplete="off" required></label>
        <label class="field"><span class="field-label" data-ref="accountLabel">Conto</span><input class="input" name="account" list="entry-accounts" autocomplete="off" required></label>
        <label class="field" data-ref="toAccountField"><span class="field-label">Al conto</span><input class="input" name="toAccount" list="entry-accounts" autocomplete="off"></label>
        <label class="field" data-ref="categoryField"><span class="field-label">Categoria</span><input class="input" name="category" list="entry-categories" placeholder="Scegli o scrivi" autocomplete="off"></label>
        <label class="field"><span class="field-label">Tag <span class="field-optional">facoltativo</span></span><input class="input" name="tag" autocomplete="off" maxlength="60"></label>
        <label class="field field-full"><span class="field-label">Descrizione <span class="field-optional">facoltativa</span></span><input class="input" name="comment" autocomplete="off" maxlength="200" placeholder="es. Cena con amici"></label>
      </div>
      <datalist id="entry-accounts" data-ref="accounts"></datalist>
      <datalist id="entry-categories" data-ref="categories"></datalist>
      <p class="field-error" data-ref="error" role="alert" hidden></p>
      <div class="form-actions">
        <button type="submit" class="btn btn-primary" data-ref="submit"></button>
        <button type="button" class="btn btn-ghost" data-ref="cancel">Annulla</button>
        <button type="button" class="btn btn-ghost btn-danger" data-ref="remove" hidden>${icon('trash')}Elimina</button>
      </div>
    </form>`);

  const refs = collectRefs(element);
  const fields = refs.form.elements;
  let kind = 'expense';
  let editingId = null;
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

  function syncOptions(state) {
    render(refs.accounts, selectAccounts(state).map((name) => html`<option value="${name}"></option>`));
    const categories = kind === 'transfer' ? [] : selectCategories(state)[kind];
    render(refs.categories, categories.map((name) => html`<option value="${name}"></option>`));
  }

  function showError(message) {
    refs.error.textContent = message ?? '';
    refs.error.hidden = !message;
  }

  function open(entry) {
    editingId = entry?.id ?? null;
    const values = entry ? entryInput(entry) : { date: todayISO() };
    for (const name of FIELDS) fields[name].value = values[name] ?? '';
    fields.amount.value = formatAmountInput(values.amount);
    refs.title.textContent = editingId ? 'Modifica movimento' : 'Nuovo movimento';
    render(refs.submit, editingId ? html`Salva modifiche` : html`${icon('plus')}Aggiungi`);
    refs.remove.hidden = !editingId;
    showError(null);
    setKind(values.kind ?? 'expense');
    element.hidden = false;
    requestAnimationFrame(() => {
      element.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      fields.amount.focus();
    });
  }

  function close() {
    element.hidden = true;
    editingId = null;
  }

  const readForm = () => ({ kind, ...Object.fromEntries(FIELDS.map((name) => [name, fields[name].value])) });

  element.addEventListener('click', (event) => {
    const kindButton = event.target.closest('[data-kind]');
    if (kindButton) setKind(kindButton.dataset.kind);
  });
  refs.close.addEventListener('click', close);
  refs.cancel.addEventListener('click', close);
  refs.form.addEventListener('input', () => showError(null));
  refs.form.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') close();
  });

  refs.remove.addEventListener('click', async () => {
    if (!editingId || !window.confirm('Eliminare questo movimento inserito a mano?')) return;
    if (await actions.deleteEntry(editingId)) close();
  });

  refs.form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (saving) return;
    const input = readForm();
    const { error } = normalizeEntry(input);
    if (error) return showError(error);

    saving = true;
    refs.submit.disabled = true;
    const saved = await actions.saveEntry(editingId, input);
    saving = false;
    refs.submit.disabled = false;
    if (!saved) return;

    if (editingId) return close();
    // Pronto per il prossimo: si azzerano solo importo e dettagli.
    for (const name of ['amount', 'tag', 'comment']) fields[name].value = '';
    fields.amount.focus();
  });

  watch(store, ['entryDraft', 'transactions', 'config'], (state) => {
    if (state.entryDraft && state.entryDraft.token !== lastToken) {
      lastToken = state.entryDraft.token;
      open(state.entryDraft.entry);
    } else if (!element.hidden) {
      syncOptions(state);
    }
  });
}
