import { collectRefs } from '../lib/html.js';

// Two frames: the browser paints "Verifica in corso…" and closes the AutoFill panel
// before key derivation starts.
const nextPaint = () => new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));

// Code screen: the only entry point. The code stays in this function just long enough
// to derive the password and key, then the field is cleared.
export function mountLogin(element, { configured, accountEmail, onSubmit }) {
  const refs = collectRefs(element);

  // iOS AutoFill saves and suggests username + password pairs: without the username field
  // the saved entry is orphaned and the panel can hang.
  refs.username.value = accountEmail ?? '';

  const showError = (message) => {
    refs.error.textContent = message;
    refs.error.hidden = !message;
  };

  const setBusy = (busy) => {
    // readOnly, not disabled: disabling the field while AutoFill is filling it
    // leaves Safari on iOS waiting for a field that no longer responds.
    refs.code.readOnly = busy;
    refs.submit.disabled = busy;
    refs.submitLabel.textContent = busy ? 'Verifica in corso…' : 'Sblocca';
  };

  if (!configured) {
    refs.code.disabled = true;
    refs.submit.disabled = true;
    showError('Firebase non è ancora configurato: compila js/config.js seguendo DEPLOY.md.');
    return;
  }

  let busy = false;
  refs.form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (busy) return;
    const code = refs.code.value;
    if (!code) return showError('Inserisci il codice');
    busy = true;
    showError('');
    setBusy(true);
    await nextPaint();
    try {
      await onSubmit(code);
      refs.code.value = '';
    } catch (error) {
      showError(error.message);
      setBusy(false);
      busy = false;
      refs.code.select();
    }
  });
}
