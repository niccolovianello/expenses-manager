import { html, render } from '../lib/html.js';

// Confirmation inside the form, in place of its buttons, instead of the browser's dialog.
// Resolves true on confirm, false on cancel or Escape. Focus starts on "Annulla", the safe choice.
export function askInline(actionsRow, { message, detail = '', confirmLabel, danger = false }) {
  return new Promise((resolve) => {
    const strip = document.createElement('div');
    strip.className = 'confirm-strip';
    strip.setAttribute('role', 'alertdialog');
    strip.setAttribute('aria-modal', 'false');
    render(strip, html`
      <div class="confirm-text">
        <p class="confirm-message" id="confirm-message">${message}</p>
        ${detail ? html`<p class="confirm-detail">${detail}</p>` : ''}
      </div>
      <div class="confirm-buttons">
        <button type="button" class="btn ${danger ? 'btn-danger-solid' : 'btn-primary'}" data-answer="yes">${confirmLabel}</button>
        <button type="button" class="btn btn-ghost" data-answer="no">Annulla</button>
      </div>`);
    strip.setAttribute('aria-labelledby', 'confirm-message');
    actionsRow.hidden = true;
    actionsRow.after(strip);

    const done = (answer) => {
      strip.remove();
      actionsRow.hidden = false;
      resolve(answer);
    };
    strip.addEventListener('click', (event) => {
      const button = event.target.closest('[data-answer]');
      if (button) done(button.dataset.answer === 'yes');
    });
    strip.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      done(false);
    });
    strip.querySelector('[data-answer="no"]').focus();
  });
}
