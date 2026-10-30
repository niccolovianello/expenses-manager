import { html, render, collectRefs } from '../lib/html.js';
import { icon } from '../lib/icons.js';
import { formatRange } from '../lib/format.js';
import { GRANULARITIES, PRESETS } from '../lib/periods.js';
import { watch } from '../state/store.js';
import { selectAccounts } from '../state/selectors.js';

const presetLabel = (id) => PRESETS.find((preset) => preset.id === id)?.label;

// Period bar: drives every view that shows data over time.
// On the phone it collapses to a sticky row (‹ period ›) that expands to the full controls.
export function mountPeriodBar(element, store, actions) {
  render(element, html`
    <div class="period-summary">
      <button type="button" class="icon-btn" data-step="-1" aria-label="Periodo precedente">${icon('chevron-left')}</button>
      <button type="button" class="period-toggle" data-ref="toggle" aria-expanded="false" aria-controls="period-controls">
        <span class="period-name" data-ref="name"></span>
        <span class="period-dates" data-ref="dates"></span>
        ${icon('chevron-down', { size: 14, className: 'period-chevron' })}
      </button>
      <button type="button" class="icon-btn" data-step="1" aria-label="Periodo successivo">${icon('chevron-right')}</button>
    </div>
    <div class="period-controls" id="period-controls">
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
      </div>
    </div>`);

  const refs = collectRefs(element);
  let renderedAccounts = null;

  const setOpen = (open) => {
    element.classList.toggle('is-open', open);
    refs.toggle.setAttribute('aria-expanded', String(open));
  };

  element.addEventListener('click', (event) => {
    if (event.target.closest('[data-ref="toggle"]')) return setOpen(!element.classList.contains('is-open'));
    const preset = event.target.closest('[data-preset]');
    if (preset) {
      actions.setPreset(preset.dataset.preset);
      setOpen(false);
    }
    const step = event.target.closest('[data-step]');
    if (step) actions.stepPeriod(Number(step.dataset.step));
  });

  element.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && element.classList.contains('is-open')) {
      setOpen(false);
      refs.toggle.focus();
    }
  });

  element.addEventListener('change', (event) => {
    const { name, value } = event.target;
    if (name === 'from' || name === 'to') actions.setCustomRange(refs.from.value, refs.to.value);
    if (name === 'granularity') actions.setGranularity(value);
    if (name === 'account') actions.setAccount(value);
  });

  watch(store, ['period', 'granularity', 'account', 'transactions'], (state) => {
    const { period } = state;
    for (const button of element.querySelectorAll('[data-preset]')) {
      button.setAttribute('aria-pressed', String(button.dataset.preset === period.preset));
    }
    refs.from.value = period.from;
    refs.to.value = period.to;
    refs.granularity.value = state.granularity;

    const name = presetLabel(period.preset);
    const account = state.account === 'all' ? '' : state.account;
    refs.name.textContent = name ?? formatRange(period);
    refs.dates.textContent = [name ? formatRange(period) : '', account].filter(Boolean).join(' · ');
    refs.dates.hidden = !refs.dates.textContent;

    const accounts = selectAccounts(state);
    if (accounts !== renderedAccounts) {
      renderedAccounts = accounts;
      render(refs.account, html`<option value="all">Tutti i conti</option>
        ${accounts.map((acc) => html`<option value="${acc}">${acc}</option>`)}`);
    }
    refs.account.value = state.account;
  });
}
