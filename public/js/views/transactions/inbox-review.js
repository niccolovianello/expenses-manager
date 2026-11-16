import { html, render, collectRefs } from '../../lib/html.js';
import { icon } from '../../lib/icons.js';
import { formatDate } from '../../lib/format.js';
import { watch } from '../../state/store.js';
import { askInline } from '../../components/confirm.js';

const received = (item) => (item.receivedAt ? `ricevuto il ${formatDate(item.receivedAt.slice(0, 10))}` : '');

// Telegram messages the app could not turn into a transaction on its own: each one opens in the
// form to complete, or is discarded. Hidden when there is nothing waiting.
export function mountInboxReview(element, store, actions) {
  render(element, html`
    <header class="panel-head">
      <div>
        <h2 class="panel-title">Da Telegram, da rivedere</h2>
        <p class="panel-sub">Questi messaggi non bastavano per un movimento: completali e aggiungili, oppure scartali.</p>
      </div>
    </header>
    <ul class="recurring-list" data-ref="list"></ul>`);

  const refs = collectRefs(element);
  let asking = false;

  element.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-action]');
    const id = button?.closest('[data-inbox]')?.dataset.inbox;
    if (!id || asking) return;
    if (button.dataset.action === 'review-inbox') return actions.reviewInboxItem(id);
    if (button.dataset.action !== 'discard-inbox') return;
    asking = true;
    const confirmed = await askInline(button.parentElement, {
      message: 'Scartare questo messaggio?',
      detail: 'Non diventa un movimento. Se ti serve, riscrivilo al bot.',
      confirmLabel: 'Scarta',
      danger: true,
    });
    asking = false;
    if (confirmed) await actions.discardInboxItem(id);
  });

  watch(store, ['status', 'route', 'inboxReview', 'inboxUnreadable'], (state) => {
    const { inboxReview: review, inboxUnreadable: unreadable } = state;
    element.hidden = !review.length && !unreadable.length;
    if (element.hidden || state.status !== 'ready' || state.route !== 'transactions') return;
    render(refs.list, html`
      ${review.map((item) => html`<li class="inbox-row" data-inbox="${item.id}">
        <span class="recurring-mark" aria-hidden="true">${icon('send', { size: 16 })}</span>
        <span class="recurring-main">
          <span class="cell-title truncate">“${item.text || '…'}”</span>
          <span class="cell-sub">${[item.error, received(item)].filter(Boolean).join(' · ')}</span>
        </span>
        <span class="inbox-actions">
          <button type="button" class="btn btn-secondary btn-sm" data-action="review-inbox">${icon('pencil', { size: 14 })}Completa</button>
          <button type="button" class="btn btn-ghost btn-sm" data-action="discard-inbox">Scarta</button>
        </span>
      </li>`)}
      ${unreadable.map((item) => html`<li class="inbox-row is-unreadable" data-inbox="${item.id}">
        <span class="recurring-mark" aria-hidden="true">${icon('alert', { size: 16 })}</span>
        <span class="recurring-main">
          <span class="cell-title">Messaggio illeggibile</span>
          <span class="cell-sub">Cifrato con una chiave diversa da quella attuale (rigenerata in Conti?) o danneggiato.</span>
        </span>
        <span class="inbox-actions">
          <button type="button" class="btn btn-ghost btn-sm" data-action="discard-inbox">Scarta</button>
        </span>
      </li>`)}`);
  });
}
