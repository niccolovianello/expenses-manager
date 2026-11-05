import { html, render, collectRefs } from '../../lib/html.js';
import { icon } from '../../lib/icons.js';
import { formatCount, formatRange } from '../../lib/format.js';
import { watch } from '../../state/store.js';
import { selectAccounts, selectCategorized } from '../../state/selectors.js';
import { exportFileName, exportRows, toCSV } from '../../domain/export.js';
import { showToast } from '../../components/toast.js';

const KINDS = [
  { id: 'all', label: 'Tutti' },
  { id: 'expense', label: 'Uscite' },
  { id: 'income', label: 'Entrate' },
  { id: 'transfer', label: 'Giroconti' },
];

// The accounts of the Conti section and those named by any transaction, once each.
const accountNames = (state) =>
  [...new Set([...state.accounts.map((account) => account.name), ...selectAccounts(state)])]
    .sort((a, b) => a.localeCompare(b, 'it'));

function download(text, fileName) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const link = Object.assign(document.createElement('a'), { href: url, download: fileName });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Downloads the transactions as CSV. It starts from everything (all time, all accounts, all kinds)
// and ignores the period bar and the table filters, unless "Periodo selezionato" copies the period.
export function mountExportPanel(element, store) {
  render(element, html`
    <header class="panel-head">
      <div>
        <h2 class="panel-title">Esporta in CSV</h2>
        <p class="panel-sub">Tutti i movimenti, compresi quelli manuali, ricorrenti e le ricariche, con la categoria attuale.</p>
      </div>
      <button type="button" class="icon-btn" data-action="close-export" aria-label="Chiudi l'esportazione">${icon('x')}</button>
    </header>
    <form class="export-form" data-ref="form" novalidate>
      <fieldset class="field">
        <legend class="field-label">Periodo</legend>
        <div class="export-period">
          <label class="date-field"><span class="sr-only">Dal</span><input type="date" class="input" name="from" data-ref="from"></label>
          <span class="range-sep" aria-hidden="true">–</span>
          <label class="date-field"><span class="sr-only">Al</span><input type="date" class="input" name="to" data-ref="to"></label>
          <button type="button" class="btn btn-ghost btn-sm" data-action="all-time">Sempre</button>
          <button type="button" class="btn btn-ghost btn-sm" data-action="current-period" data-ref="currentPeriod">Periodo selezionato</button>
        </div>
        <span class="field-hint" data-ref="periodHint"></span>
      </fieldset>
      <fieldset class="field">
        <legend class="field-label">Tipo</legend>
        <div class="segmented" role="group" aria-label="Tipo di movimento da esportare">
          ${KINDS.map((kind) => html`<button type="button" class="segmented-btn" data-export-kind="${kind.id}" aria-pressed="false">${kind.label}</button>`)}
        </div>
      </fieldset>
      <fieldset class="field">
        <legend class="field-label">Conti
          <button type="button" class="link-btn" data-action="toggle-accounts" data-ref="toggleAccounts"></button>
        </legend>
        <div class="export-accounts" data-ref="accounts"></div>
      </fieldset>
      <div class="form-actions">
        <button type="submit" class="btn btn-primary" data-ref="submit">${icon('download')}<span data-ref="submitLabel"></span></button>
        <button type="button" class="btn btn-ghost" data-action="close-export">Annulla</button>
      </div>
    </form>`);

  const refs = collectRefs(element);
  let kind = 'all';
  // Unticked accounts: one that appears later (a new import) is included.
  const excluded = new Set();
  let renderedNames = null;

  const filters = () => {
    const names = accountNames(store.get());
    return {
      from: refs.from.value,
      to: refs.to.value,
      kind,
      accounts: excluded.size ? names.filter((name) => !excluded.has(name)) : null,
    };
  };

  function sync() {
    const state = store.get();
    const names = accountNames(state);
    if (names.join('\n') !== renderedNames) {
      renderedNames = names.join('\n');
      render(refs.accounts, names.map((name) => html`<label class="check"><input type="checkbox" name="account" value="${name}"><span>${name}</span></label>`));
    }
    for (const box of refs.accounts.querySelectorAll('input')) box.checked = !excluded.has(box.value);
    const allTicked = names.every((name) => !excluded.has(name));
    refs.toggleAccounts.textContent = allTicked ? 'Deseleziona tutti' : 'Seleziona tutti';

    for (const button of element.querySelectorAll('[data-export-kind]')) {
      button.setAttribute('aria-pressed', String(button.dataset.exportKind === kind));
    }
    const { from, to } = filters();
    refs.periodHint.textContent = !from && !to ? 'Da sempre a oggi' : from && to ? formatRange({ from, to }) : from ? `Dal ${formatRange({ from, to: from })}` : `Fino al ${formatRange({ from: to, to })}`;
    refs.currentPeriod.title = formatRange(state.period);

    const count = exportRows(selectCategorized(state), filters()).length;
    const badRange = from && to && from > to;
    refs.submit.disabled = !count || badRange;
    refs.submitLabel.textContent = badRange
      ? 'La data iniziale è dopo quella finale'
      : count ? `Scarica ${formatCount(count)} ${count === 1 ? 'movimento' : 'movimenti'}` : 'Nessun movimento da esportare';
  }

  element.addEventListener('click', (event) => {
    const target = event.target;
    const kindButton = target.closest('[data-export-kind]');
    if (kindButton) {
      kind = kindButton.dataset.exportKind;
      return sync();
    }
    const action = target.closest('[data-action]')?.dataset.action;
    if (action === 'close-export') {
      element.hidden = true;
      return element.dispatchEvent(new CustomEvent('export-closed', { bubbles: true }));
    }
    if (action === 'all-time') {
      refs.from.value = '';
      refs.to.value = '';
    } else if (action === 'current-period') {
      ({ from: refs.from.value, to: refs.to.value } = store.get().period);
    } else if (action === 'toggle-accounts') {
      const names = accountNames(store.get());
      if (names.every((name) => !excluded.has(name))) names.forEach((name) => excluded.add(name));
      else excluded.clear();
    } else {
      return;
    }
    sync();
  });

  element.addEventListener('change', (event) => {
    const target = event.target;
    if (target.name === 'account') {
      if (target.checked) excluded.delete(target.value);
      else excluded.add(target.value);
    }
    sync();
  });

  refs.form.addEventListener('submit', (event) => {
    event.preventDefault();
    const current = filters();
    const rows = exportRows(selectCategorized(store.get()), current);
    if (!rows.length) return;
    download(toCSV(rows), exportFileName(current));
    showToast(`Esportati ${formatCount(rows.length)} movimenti`);
  });

  watch(store, ['transactions', 'config', 'accounts', 'period'], () => {
    if (!element.hidden) sync();
  });

  return {
    open() {
      element.hidden = false;
      sync();
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
      element.querySelector('h2')?.setAttribute('tabindex', '-1');
      element.querySelector('h2')?.focus({ preventScroll: true });
    },
    close() {
      element.hidden = true;
    },
    get isOpen() {
      return !element.hidden;
    },
  };
}
