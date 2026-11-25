import { html, render, collectRefs } from '../../lib/html.js';
import { icon } from '../../lib/icons.js';
import { formatDate } from '../../lib/format.js';
import { watch } from '../../state/store.js';
import { askInline } from '../../components/confirm.js';
import { showToast } from '../../components/toast.js';

// Connection with the Telegram bot (see TELEGRAM-BOT.md). The bot needs three values: where the inbox is
// (the user id), the public key to seal messages with, and the key it reads the schedule of automatic
// movements with. Only the last one is secret; the private key never leaves the encrypted vault.
export function mountTelegramPanel(element, store, actions) {
  render(element, html`
    <header class="panel-head">
      <div>
        <h2 class="panel-title">Telegram</h2>
        <p class="panel-sub" data-ref="sub"></p>
      </div>
    </header>
    <div data-ref="body"></div>`);

  const refs = collectRefs(element);
  let busy = false;

  async function copy(text, what) {
    try {
      await navigator.clipboard.writeText(text);
      showToast(`${what} copiato`);
    } catch {
      showToast('Copia non riuscita: seleziona il testo e copialo a mano', { tone: 'error' });
    }
  }

  element.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-action]');
    if (!button || busy) return;
    const setup = store.get().inboxSetup;
    const action = button.dataset.action;
    if (action === 'copy-uid' && setup) return copy(setup.ownerUid ?? '', 'ID utente');
    if (action === 'copy-key' && setup) return copy(JSON.stringify(setup.publicJwk), 'Chiave pubblica');
    if (action === 'copy-schedule' && setup) return copy(setup.scheduleKey ?? '', 'Chiave del calendario');
    if (action !== 'set-up' && action !== 'regenerate') return;
    busy = true;
    const confirmed = action === 'set-up' || await askInline(button.parentElement, {
      message: 'Creare una nuova chiave?',
      detail: 'Dovrai copiare di nuovo le due chiavi nel bot. I messaggi che il bot ha già cifrato con quella attuale e che non hai ancora aperto diventano illeggibili.',
      confirmLabel: 'Crea nuova chiave',
      danger: true,
    });
    if (confirmed) {
      button.disabled = true;
      await actions.setUpTelegram();
      button.disabled = false;
    }
    busy = false;
  });

  watch(store, ['status', 'route', 'inboxSetup'], (state) => {
    if (state.status !== 'ready' || state.route !== 'accounts') return;
    const setup = state.inboxSetup;
    refs.sub.textContent = setup
      ? 'Il bot cifra ogni messaggio con questa chiave pubblica: solo quest’app, sbloccata con il tuo codice, può leggerli. Copia i tre valori nella configurazione del bot.'
      : 'Scrivi le spese a un bot Telegram: arrivano qui la prossima volta che apri l’app. Per cominciare, crea la chiave con cui il bot cifrerà i messaggi.';
    render(refs.body, setup
      ? html`<div class="telegram-values">
          <div class="field field-full">
            <span class="field-label" id="tg-uid-label">ID utente <code>OWNER_UID</code></span>
            <div class="copy-field">
              <input class="input" readonly value="${setup.ownerUid ?? ''}" aria-labelledby="tg-uid-label">
              <button type="button" class="btn btn-secondary btn-sm" data-action="copy-uid">${icon('copy', { size: 14 })}Copia</button>
            </div>
          </div>
          <div class="field field-full">
            <span class="field-label" id="tg-key-label">Chiave pubblica <code>INBOX_PUBLIC_KEY</code></span>
            <div class="copy-field">
              <textarea class="input copy-value" readonly rows="3" aria-labelledby="tg-key-label">${JSON.stringify(setup.publicJwk)}</textarea>
              <button type="button" class="btn btn-secondary btn-sm" data-action="copy-key">${icon('copy', { size: 14 })}Copia</button>
            </div>
          </div>
          <div class="field field-full">
            <span class="field-label" id="tg-schedule-label">Chiave del calendario <code>SCHEDULE_KEY</code></span>
            <div class="copy-field">
              <input class="input" type="password" readonly value="${setup.scheduleKey ?? ''}" aria-labelledby="tg-schedule-label">
              <button type="button" class="btn btn-secondary btn-sm" data-action="copy-schedule">${icon('copy', { size: 14 })}Copia</button>
            </div>
            <span class="field-hint">Con questa il bot legge movimenti ricorrenti e ricariche per avvisarti il giorno in cui avvengono. Tienila segreta.</span>
          </div>
        </div>
        <div class="form-actions">
          <span class="field-hint">${setup.createdAt ? `Chiave creata il ${formatDate(setup.createdAt.slice(0, 10))}` : ''}</span>
          <button type="button" class="btn btn-ghost btn-sm" data-action="regenerate">${icon('refresh', { size: 14 })}Rigenera chiave</button>
        </div>`
      : html`<div class="form-actions">
          <button type="button" class="btn btn-primary" data-action="set-up">${icon('send')}Collega Telegram</button>
        </div>`);
  });
}
