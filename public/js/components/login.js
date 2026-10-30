import { collectRefs } from '../lib/html.js';

// Due frame: il browser dipinge "Verifica in corso…" e chiude il pannello di AutoFill
// prima che parta la derivazione delle chiavi.
const nextPaint = () => new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));

// Schermata del codice: l'unico punto d'ingresso. Il codice resta in questa funzione
// il tempo di ricavare password e chiave, poi il campo viene svuotato.
export function mountLogin(element, { configured, accountEmail, onSubmit }) {
  const refs = collectRefs(element);

  // AutoFill di iOS salva e propone coppie utente + password: senza il campo utente
  // la voce salvata resta orfana e il pannello può bloccarsi.
  refs.username.value = accountEmail ?? '';

  const showError = (message) => {
    refs.error.textContent = message;
    refs.error.hidden = !message;
  };

  const setBusy = (busy) => {
    // readOnly e non disabled: disabilitare il campo mentre AutoFill lo sta compilando
    // lascia Safari su iOS in attesa di un campo che non risponde più.
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
