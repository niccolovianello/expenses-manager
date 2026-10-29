import { describeRule, RULE_KINDS } from '../../domain/categorize.js';
import { html, render } from '../../lib/html.js';
import { icon } from '../../lib/icons.js';
import { formatCount } from '../../lib/format.js';
import { watch } from '../../state/store.js';
import { selectCategorized, selectColorMaps } from '../../state/selectors.js';
import { emptyState, swatch } from '../../components/common.js';

export function mountRuleList(element, store, actions) {
  element.addEventListener('click', (event) => {
    const button = event.target.closest('[data-action]');
    if (!button) return;
    const rule = store.get().config.rules.find((candidate) => candidate.id === button.closest('[data-rule]')?.dataset.rule);
    if (!rule) return;
    const { action } = button.dataset;
    if (action === 'edit') actions.draftRule(rule);
    if (action === 'up' || action === 'down') actions.moveRule(rule, action);
    if (action === 'delete') actions.deleteRule(rule);
  });
  element.addEventListener('change', (event) => {
    if (event.target.dataset.action !== 'toggle') return;
    const rule = store.get().config.rules.find((candidate) => candidate.id === event.target.closest('[data-rule]').dataset.rule);
    if (rule) actions.toggleRule(rule);
  });

  watch(store, ['status', 'config', 'transactions'], (state) => {
    if (state.status !== 'ready') return;
    const { rules } = state.config;
    const applied = new Map();
    for (const tx of selectCategorized(state)) {
      if (tx.ruleId) applied.set(tx.ruleId, (applied.get(tx.ruleId) ?? 0) + 1);
    }
    const colors = selectColorMaps(state);

    render(element, html`
      <header class="panel-head">
        <div>
          <h2 class="panel-title">Regole attive</h2>
          <p class="panel-sub">Applicate dall'alto in basso: vince la prima che corrisponde.</p>
        </div>
      </header>
      ${rules.length
        ? html`<ol class="rule-list">${rules.map((rule, index) => html`<li class="rule-row${rule.enabled ? '' : ' is-disabled'}" data-rule="${rule.id}">
            <div class="rule-body">
              <p class="rule-text">
                <span>${describeRule(rule)}</span>
                ${icon('arrow-right', { size: 14 })}
                <span class="rule-target">${swatch(colors[rule.kind].colorOf(rule.category))}<strong>${rule.category}</strong></span>
              </p>
              <p class="rule-meta">${RULE_KINDS[rule.kind]} · ${rule.enabled ? `${formatCount(applied.get(rule.id) ?? 0)} movimenti` : 'sospesa'}</p>
            </div>
            <div class="rule-actions">
              <label class="switch" title="${rule.enabled ? 'Sospendi' : 'Attiva'}">
                <input type="checkbox" data-action="toggle" ${rule.enabled ? 'checked' : ''} aria-label="Regola attiva">
                <span class="switch-track" aria-hidden="true"></span>
              </label>
              <button type="button" class="icon-btn" data-action="up" aria-label="Sposta su" ${index === 0 ? 'disabled' : ''}>${icon('chevron-up')}</button>
              <button type="button" class="icon-btn" data-action="down" aria-label="Sposta giù" ${index === rules.length - 1 ? 'disabled' : ''}>${icon('chevron-down')}</button>
              <button type="button" class="icon-btn" data-action="edit" aria-label="Modifica regola">${icon('pencil')}</button>
              <button type="button" class="icon-btn icon-btn-danger" data-action="delete" aria-label="Elimina regola">${icon('trash')}</button>
            </div>
          </li>`)}</ol>`
        : emptyState({
            title: 'Nessuna regola',
            body: 'Crea la prima qui sopra, oppure dal pulsante “Crea regola” accanto a un movimento.',
          })}`);
  });
}
