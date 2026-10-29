import { collectRefs } from '../lib/html.js';

// Schermata del codice: l'unico punto d'ingresso. Il codice resta in questa funzione
// il tempo di ricavare password e chiave, poi il campo viene svuotato.
export function mountLogin(element, { configured, onSubmit }) {
  const refs = collectRefs(element);

  const showError = (message) => {
    refs.error.textContent = message;
    refs.error.hidden = !message;
  };

  if (!configured) {
    refs.code.disabled = true;
    refs.submit.disabled = true;
    showError('Firebase non è ancora configurato: compila js/config.js seguendo DEPLOY.md.');
    return;
  }

  refs.form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const code = refs.code.value;
    if (!code) return showError('Inserisci il codice');
    showError('');
    refs.submit.disabled = true;
    refs.code.disabled = true;
    refs.submitLabel.textContent = 'Verifica in corso…';
    try {
      await onSubmit(code);
      refs.code.value = '';
    } catch (error) {
      showError(error.message);
      refs.code.disabled = false;
      refs.submit.disabled = false;
      refs.submitLabel.textContent = 'Sblocca';
      refs.code.select();
    }
  });
}
