import { normalizeCategory } from '../../domain/categorize.js';

// Sostituisce il menu della categoria con un campo di testo per crearne una nuova.
export function startNewCategory(select, { onCommit, onCancel }) {
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'input input-compact';
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
}
