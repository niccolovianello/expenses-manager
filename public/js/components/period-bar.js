import { html, render, collectRefs } from '../lib/html.js';
import { icon } from '../lib/icons.js';
import { GRANULARITIES, PRESETS } from '../lib/periods.js';
import { watch } from '../state/store.js';
import { selectAccounts } from '../state/selectors.js';

// Barra del periodo: comanda tutte le viste che mostrano dati nel tempo.
export function mountPeriodBar(element, store, actions) {
  render(element, html`
    <div class="segmented period-presets" role="group" aria-label="Periodo rapido">
      ${PRESETS.map((preset) => html`<button type="button" class="segmented-btn" data-preset="${preset.id}" aria-pressed="false">${preset.label}</button>`)}
    </div>
    <div class="period-range" role="group" aria-label="Intervallo di date">
      <button type="button" class="icon-btn" data-step="-1" aria-label="Periodo precedente">${icon('chevron-left')}</button>
      <label class="date-field"><span class="sr-only">Dal</span><input type="date" class="input" name="from" data-ref="from"></label>
      <span class="range-sep" aria-hidden="true">–</span>
      <label class="date-field"><span class="sr-only">Al</span><input type="date" class="input" name="to" data-ref="to"></label>
      <button type="button" class="icon-btn" data-step="1" aria-label="Periodo successivo">${icon('chevron-right')}</button>
    </div>
    <div class="period-options">
      <label class="field-inline">
        <span class="field-label">Raggruppa per</span>
        <select class="input" name="granularity" data-ref="granularity">
          ${GRANULARITIES.map((g) => html`<option value="${g.id}">${g.label}</option>`)}
        </select>
      </label>
      <label class="field-inline">
        <span class="field-label">Conto</span>
        <select class="input" name="account" data-ref="account"></select>
      </label>
    </div>`);

  const refs = collectRefs(element);
  let renderedAccounts = null;

  element.addEventListener('click', (event) => {
    const preset = event.target.closest('[data-preset]');
    if (preset) actions.setPreset(preset.dataset.preset);
    const step = event.target.closest('[data-step]');
    if (step) actions.stepPeriod(Number(step.dataset.step));
  });

  element.addEventListener('change', (event) => {
    const { name, value } = event.target;
    if (name === 'from' || name === 'to') actions.setCustomRange(refs.from.value, refs.to.value);
    if (name === 'granularity') actions.setGranularity(value);
    if (name === 'account') actions.setAccount(value);
  });

  watch(store, ['period', 'granularity', 'account', 'transactions'], (state) => {
    for (const button of element.querySelectorAll('[data-preset]')) {
      button.setAttribute('aria-pressed', String(button.dataset.preset === state.period.preset));
    }
    refs.from.value = state.period.from;
    refs.to.value = state.period.to;
    refs.granularity.value = state.granularity;

    const accounts = selectAccounts(state);
    if (accounts !== renderedAccounts) {
      renderedAccounts = accounts;
      render(refs.account, html`<option value="all">Tutti i conti</option>
        ${accounts.map((account) => html`<option value="${account}">${account}</option>`)}`);
    }
    refs.account.value = state.account;
  });
}
