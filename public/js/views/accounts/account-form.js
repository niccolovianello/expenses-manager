import { ACCOUNT_COLORS, ACCOUNT_ICONS, normalizeAccount } from '../../domain/accounts.js';
import { html, render, collectRefs } from '../../lib/html.js';
import { icon } from '../../lib/icons.js';

const formatBalanceInput = (amount) => amount.toFixed(2).replace('.', ',');

// Form to create or edit an account. The balance field shows the current balance:
// it is saved only if changed, and from then on it is the new starting point.
export function mountAccountForm(element, store, actions) {
  render(element, html`
    <header class="panel-head">
      <div>
        <h2 class="panel-title" data-ref="title"></h2>
        <p class="panel-sub" data-ref="sub"></p>
      </div>
      <button type="button" class="icon-btn" data-ref="close" aria-label="Chiudi il modulo">${icon('x')}</button>
    </header>
    <form class="entry-form" data-ref="form" novalidate>
      <div class="entry-fields">
        <label class="field field-wide"><span class="field-label">Nome</span><input class="input" name="name" autocomplete="off" maxlength="60" required></label>
        <label class="field"><span class="field-label">Saldo (€)</span><input class="input input-amount" name="balance" inputmode="decimal" placeholder="0,00" autocomplete="off"></label>
        <label class="check account-excluded"><input type="checkbox" name="excluded"><span>Escludi dal totale</span></label>
        <fieldset class="field field-full">
          <legend class="field-label">Icona</legend>
          <div class="picker">${Object.entries(ACCOUNT_ICONS).map(([id, label]) => html`<label class="picker-option" title="${label}">
            <input type="radio" name="icon" value="${id}" class="sr-only"><span class="picker-icon">${icon(id, { size: 18 })}</span><span class="sr-only">${label}</span>
          </label>`)}</div>
        </fieldset>
        <fieldset class="field field-full">
          <legend class="field-label">Colore</legend>
          <div class="picker">${ACCOUNT_COLORS.map((color) => html`<label class="picker-option">
            <input type="radio" name="color" value="${color}" class="sr-only"><span class="picker-color" style="--account-color: ${color}"></span><span class="sr-only">${color}</span>
          </label>`)}</div>
        </fieldset>
      </div>
      <span class="field-error" id="account-error" data-ref="error" role="alert" hidden></span>
      <div class="form-actions" data-ref="actions">
        <button type="submit" class="btn btn-primary" data-ref="submit"></button>
        <button type="button" class="btn btn-ghost" data-ref="cancel">Annulla</button>
        <button type="button" class="btn btn-ghost btn-danger" data-ref="remove" hidden>${icon('trash')}Elimina</button>
      </div>
    </form>`);

  const refs = collectRefs(element);
  const fields = refs.form.elements;
  let editing = null;
  let shownBalance = '';
  let saving = false;

  function showError(message, field = null) {
    for (const input of refs.form.querySelectorAll('[aria-invalid]')) {
      input.removeAttribute('aria-invalid');
      input.removeAttribute('aria-describedby');
    }
    refs.error.textContent = message ?? '';
    refs.error.hidden = !message;
    const input = message && field ? fields[field] : null;
    if (!(input instanceof HTMLInputElement)) return refs.actions.before(refs.error);
    input.setAttribute('aria-invalid', 'true');
    input.setAttribute('aria-describedby', 'account-error');
    input.closest('.field').append(refs.error);
    input.focus();
  }

  function open(account) {
    editing = account;
    const used = new Set(store.get().accounts.map((other) => other.color));
    fields.name.value = account?.name ?? '';
    shownBalance = account ? formatBalanceInput(account.current) : '';
    fields.balance.value = shownBalance;
    fields.excluded.checked = account?.excluded ?? false;
    fields.icon.value = account?.icon ?? 'wallet';
    fields.color.value = account?.color ?? ACCOUNT_COLORS.find((color) => !used.has(color)) ?? ACCOUNT_COLORS[0];
    refs.title.textContent = account ? 'Modifica conto' : 'Nuovo conto';
    refs.sub.textContent = account
      ? 'Correggi il saldo quando non corrisponde a quello reale: diventa il nuovo punto di partenza.'
      : 'Il saldo di oggi: le spese e le entrate che aggiungerai lo aggiorneranno.';
    render(refs.submit, account ? html`Salva modifiche` : html`${icon('plus')}Aggiungi`);
    refs.remove.hidden = !account;
    showError(null);
    element.hidden = false;
    requestAnimationFrame(() => {
      element.scrollIntoView({ block: 'start', behavior: 'smooth' });
      (account ? fields.balance : fields.name).focus({ preventScroll: true });
    });
  }

  function close() {
    element.hidden = true;
    editing = null;
  }

  // An untouched balance is not sent, so editing only the name or the look does not reset it.
  const readForm = () => ({
    name: fields.name.value,
    icon: fields.icon.value,
    color: fields.color.value,
    excluded: fields.excluded.checked,
    ...(editing && fields.balance.value.trim() === shownBalance ? {} : { balance: fields.balance.value }),
  });

  refs.close.addEventListener('click', close);
  refs.cancel.addEventListener('click', close);
  refs.form.addEventListener('input', () => showError(null));
  refs.form.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') close();
  });

  refs.remove.addEventListener('click', async () => {
    if (!editing || !window.confirm(`Eliminare il conto “${editing.name}”? I movimenti già inseriti restano.`)) return;
    if (await actions.deleteAccount(editing.id)) close();
  });

  refs.form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (saving) return;
    const input = readForm();
    const others = store.get().accounts.filter((other) => other.id !== editing?.id);
    const { error, field } = normalizeAccount(input, others);
    if (error) return showError(error, field);

    saving = true;
    refs.submit.disabled = true;
    const saved = await actions.saveAccount(editing?.id ?? null, input);
    saving = false;
    refs.submit.disabled = false;
    if (saved) close();
  });

  return { open };
}
