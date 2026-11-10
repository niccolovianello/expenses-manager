import { normalizeCategory } from '../../domain/categorize.js';
import { html, render } from '../../lib/html.js';

export const NEW_CATEGORY = '__new__';

// Fills a category menu: the known categories only, so a typo cannot create a new one by accident.
// `value` stays selectable even when it is not among them (an older transaction, one just created).
// Creating a category is a deliberate choice, the last option.
export function fillCategorySelect(select, names, value = '') {
  const options = value && !names.includes(value) ? [value, ...names] : names;
  render(select, html`<option value="">Scegli una categoria</option>
    ${options.map((name) => html`<option value="${name}">${name}</option>`)}
    <option value="${NEW_CATEGORY}">Nuova categoria…</option>`);
  select.value = value;
}

// Replaces the category menu with a text field for creating a new one; returns the field.
// The field takes the menu's name, so a form reading its elements still finds it.
export function startNewCategory(select, { onCommit, onCancel }) {
  const input = document.createElement('input');
  input.type = 'text';
  input.className = select.className;
  if (select.name) input.name = select.name;
  input.placeholder = 'Nome categoria, poi Invio';
  input.maxLength = 60;
  input.setAttribute('aria-label', 'Nome della nuova categoria');
  select.replaceWith(input);
  input.focus();

  let done = false;
  const finish = (commit) => {
    if (done) return;
    done = true;
    const category = normalizeCategory(input.value);
    if (commit && category) onCommit(category);
    else onCancel();
  };

  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') { event.preventDefault(); finish(true); }
    if (event.key === 'Escape') { event.preventDefault(); finish(false); }
  });
  input.addEventListener('blur', () => finish(true));
  return input;
}

// In a form: choosing "Nuova categoria…" swaps in the text field, then puts the menu back with
// the new category selected (or the previous choice, if cancelled). `onDone` runs after either.
export function handleNewCategory(select, onDone = () => {}) {
  let previous = select.value;
  select.addEventListener('focus', () => { previous = select.value; });
  select.addEventListener('change', () => {
    if (select.value !== NEW_CATEGORY) { previous = select.value; return; }
    const input = startNewCategory(select, {
      onCommit: (category) => restore(category),
      onCancel: () => restore(previous),
    });
    function restore(value) {
      if (!select.querySelector(`option[value="${CSS.escape(value)}"]`)) {
        select.querySelector(`option[value="${NEW_CATEGORY}"]`).before(new Option(value, value));
      }
      select.value = value;
      previous = value;
      // Back to the menu with focus only after Enter or Escape; on blur the user is going elsewhere.
      const hadFocus = document.activeElement === input;
      input.replaceWith(select);
      if (hadFocus) select.focus();
      onDone();
    }
  });
}
