import { applyCategorization, normalizeRule, ruleMatches, RULE_FIELDS, RULE_KINDS, RULE_OPERATORS } from '../../domain/categorize.js';
import { html, render, collectRefs } from '../../lib/html.js';
import { icon } from '../../lib/icons.js';
import { debounce } from '../../lib/memo.js';
import { describeTransaction } from '../../lib/aggregate.js';
import { formatCount, formatDateShort } from '../../lib/format.js';
import { watch } from '../../state/store.js';
import { selectCategories, selectCategorized } from '../../state/selectors.js';

const EMPTY_DRAFT = { id: null, kind: 'expense', field: 'comment', operator: 'contains', value: '', category: '' };
const EXAMPLES = 5;
const options = (entries) => Object.entries(entries).map(([value, label]) => html`<option value="${value}">${label}</option>`);

// Simula la regola sui dati reali: quanti movimenti tocca e quali cambierebbero categoria.
function simulate(state, draft) {
  const { rule } = normalizeRule(draft);
  if (!rule) return null;
  const candidate = { ...rule, id: draft.id ?? '__draft__', enabled: true };
  const rules = draft.id
    ? state.config.rules.map((existing) => (existing.id === draft.id ? candidate : existing))
    : [...state.config.rules, candidate];
  const before = selectCategorized(state);
  const after = applyCategorization(state.transactions, { ...state.config, rules });
  const changed = after
    .map((tx, index) => ({ tx, from: before[index].category }))
    .filter(({ tx, from }) => tx.category !== from);
  const matching = state.transactions.filter((tx) => ruleMatches(candidate, tx));
  return {
    matches: matching.length,
    changed,
    protectedByManual: matching.filter((tx) => state.config.overrides[tx.id]).length,
  };
}

function preview(result, draft) {
  if (!draft.value.trim()) return html`<p class="muted">Scrivi un testo per vedere subito quali movimenti corrispondono.</p>`;
  if (!result) return html`<p class="muted">Scegli la categoria da assegnare per vedere l'effetto.</p>`;
  if (!result.matches) return html`<p class="muted">Nessun movimento corrisponde per ora. La regola si applicherà ai prossimi.</p>`;
  return html`
    <p><strong class="num">${formatCount(result.matches)}</strong> movimenti corrispondono ·
      <strong class="num">${formatCount(result.changed.length)}</strong> cambierebbero categoria${result.protectedByManual
        ? html` · <span class="muted">${result.protectedByManual} con correzione manuale restano invariati</span>` : ''}</p>
    ${result.changed.length ? html`<ul class="preview-list">${result.changed.slice(0, EXAMPLES).map(({ tx, from }) => html`<li>
        <span class="muted nowrap">${formatDateShort(tx.date)}</span>
        <span class="truncate">${describeTransaction(tx)}</span>
        <span class="preview-change nowrap"><s>${from}</s> ${icon('arrow-right', { size: 12 })} ${tx.category}</span>
      </li>`)}</ul>` : ''}`;
}

export function mountRuleForm(element, store, actions) {
  render(element, html`
    <header class="panel-head">
      <div>
        <h2 class="panel-title" data-ref="title">Nuova regola</h2>
        <p class="panel-sub">Vale per tutti i movimenti, anche quelli dei prossimi export.</p>
      </div>
    </header>
    <form class="rule-form" data-ref="form" novalidate>
      <div class="rule-fields">
        <label class="field"><span class="field-label">Movimenti</span><select class="input" name="kind">${options(RULE_KINDS)}</select></label>
        <label class="field"><span class="field-label">Se il campo</span><select class="input" name="field">${options(RULE_FIELDS)}</select></label>
        <label class="field"><span class="field-label">Condizione</span><select class="input" name="operator">${options(RULE_OPERATORS)}</select></label>
        <label class="field field-wide"><span class="field-label">Testo</span><input class="input" name="value" placeholder="es. Dropbox" autocomplete="off" maxlength="100"></label>
        <label class="field field-wide"><span class="field-label">Assegna la categoria</span><input class="input" name="category" list="rule-categories" placeholder="Scegli o scrivi una categoria" autocomplete="off" maxlength="60"></label>
        <datalist id="rule-categories" data-ref="categories"></datalist>
      </div>
      <div class="rule-preview" data-ref="preview" aria-live="polite"></div>
      <p class="field-error" data-ref="error" role="alert" hidden></p>
      <div class="form-actions">
        <button type="submit" class="btn btn-primary" data-ref="submit">${icon('plus')}Aggiungi regola</button>
        <button type="button" class="btn btn-ghost" data-ref="cancel" hidden>Annulla modifica</button>
      </div>
    </form>`);

  const refs = collectRefs(element);
  const fields = refs.form.elements;
  let draft = { ...EMPTY_DRAFT };
  let lastToken = null;
  let saving = false;

  const readForm = () => ({
    ...draft,
    kind: fields.kind.value,
    field: fields.field.value,
    operator: fields.operator.value,
    value: fields.value.value,
    category: fields.category.value,
  });

  function fillForm() {
    for (const name of ['kind', 'field', 'operator', 'value', 'category']) fields[name].value = draft[name] ?? '';
    const editing = Boolean(draft.id);
    refs.title.textContent = editing ? 'Modifica regola' : 'Nuova regola';
    render(refs.submit, editing ? html`Salva modifiche` : html`${icon('plus')}Aggiungi regola`);
    refs.cancel.hidden = !editing;
    refs.error.hidden = true;
  }

  function syncCategories(state) {
    render(refs.categories, selectCategories(state)[fields.kind.value].map((name) => html`<option value="${name}"></option>`));
  }

  const refreshPreview = () => {
    const state = store.get();
    if (state.status !== 'ready') return;
    draft = readForm();
    render(refs.preview, preview(simulate(state, draft), draft));
  };
  const schedulePreview = debounce(refreshPreview, 120);

  refs.form.addEventListener('input', () => {
    refs.error.hidden = true;
    schedulePreview();
  });
  refs.form.addEventListener('change', (event) => {
    if (event.target === fields.kind) syncCategories(store.get());
    schedulePreview();
  });

  refs.cancel.addEventListener('click', () => {
    draft = { ...EMPTY_DRAFT };
    fillForm();
    refreshPreview();
  });

  refs.form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (saving) return;
    draft = readForm();
    const { error } = normalizeRule(draft);
    if (error) {
      refs.error.textContent = error;
      refs.error.hidden = false;
      return;
    }
    saving = true;
    refs.submit.disabled = true;
    const saved = await actions.saveRule(draft);
    saving = false;
    refs.submit.disabled = false;
    if (saved) {
      draft = { ...EMPTY_DRAFT };
      fillForm();
      refreshPreview();
    }
  });

  // Una bozza arriva da un'altra sezione: il modulo va mostrato e messo a fuoco solo
  // quando la vista delle regole è davvero visibile, non mentre è ancora nascosta.
  let pendingFocus = false;
  watch(store, ['status', 'route', 'config', 'transactions', 'ruleDraft'], (state) => {
    if (state.status !== 'ready') return;
    if (state.ruleDraft && state.ruleDraft.token !== lastToken) {
      lastToken = state.ruleDraft.token;
      draft = { ...EMPTY_DRAFT, ...state.ruleDraft };
      fillForm();
      pendingFocus = true;
    }
    if (pendingFocus && state.route === 'rules') {
      pendingFocus = false;
      requestAnimationFrame(() => {
        element.scrollIntoView({ block: 'start' });
        fields.value.focus({ preventScroll: true });
      });
    }
    syncCategories(state);
    refreshPreview();
  });
}
