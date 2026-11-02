import { html, render, collectRefs } from '../../lib/html.js';
import { icon } from '../../lib/icons.js';
import { formatCount, formatEUR } from '../../lib/format.js';
import { watch } from '../../state/store.js';
import { selectAccountSummary } from '../../state/selectors.js';
import { emptyState } from '../../components/common.js';
import { mountAccountForm } from './account-form.js';
import { accountColor } from '../../domain/accounts.js';

export const accountMark = (account, size = 36) => html`<span class="account-mark" style="--account-color: ${accountColor(account.color)}; --mark-size: ${size}px" aria-hidden="true">${icon(account.icon, { size: Math.round(size * 0.5) })}</span>`;

export function mountAccounts(element, store, actions) {
  render(element, html`
    <header class="view-head">
      <div class="view-heading">
        <h1 class="view-title">Conti</h1>
        <p class="view-sub">Dopo che imposti un saldo, lo aggiornano i movimenti che inserisci qui e quelli ricorrenti. I movimenti importati dall’export non lo toccano: sono già dentro il saldo che hai scritto.</p>
      </div>
      <button type="button" class="btn btn-primary" data-action="new-account">${icon('plus')}Nuovo conto</button>
    </header>
    <section class="panel entry-panel" data-ref="form" hidden></section>
    <section class="panel">
      <div class="account-total" data-ref="total"></div>
      <div data-ref="list"></div>
    </section>`);

  const refs = collectRefs(element);
  const form = mountAccountForm(refs.form, store, actions);

  element.addEventListener('click', (event) => {
    const action = event.target.closest('[data-action], [data-empty-action]');
    if (!action) return;
    if (action.dataset.action === 'new-account' || action.dataset.emptyAction === 'new-account') return form.open(null);
    const account = selectAccountSummary(store.get()).rows.find((row) => row.id === action.closest('[data-account]')?.dataset.account);
    if (action.dataset.action === 'edit-account' && account) form.open(account);
  });

  watch(store, ['status', 'route', 'accounts', 'transactions'], (state) => {
    if (state.status !== 'ready' || state.route !== 'accounts') return;
    const { rows, total } = selectAccountSummary(state);
    const excluded = rows.filter((row) => row.excluded).length;

    render(refs.total, rows.length ? html`
      <p class="figure-label">Totale disponibile</p>
      <p class="figure-value num">${formatEUR(total)}</p>
      <p class="panel-sub">${formatCount(rows.length)} conti${excluded ? ` · ${formatCount(excluded)} esclusi dal totale` : ''}</p>` : '');

    render(refs.list, rows.length
      ? html`<ul class="account-list">${rows.map((row) => html`<li data-account="${row.id}">
          <button type="button" class="account-row${row.excluded ? ' is-excluded' : ''}" data-action="edit-account" aria-label="Modifica ${row.name}, saldo ${formatEUR(row.current)}">
            ${accountMark(row)}
            <span class="account-name">${row.name}</span>
            ${row.excluded ? html`<span class="account-flag" title="Escluso dal totale">${icon('eye-off')}</span>` : ''}
            <span class="account-balance num">${formatEUR(row.current)}</span>
          </button>
        </li>`)}</ul>`
      : emptyState({
          title: 'Nessun conto',
          body: 'Aggiungi i tuoi conti con il saldo attuale: ogni nuova spesa o entrata lo aggiornerà.',
          actionLabel: 'Aggiungi un conto',
          action: 'new-account',
        }));
  });
}
