import { html, raw } from '../../lib/html.js';
import { icon } from '../../lib/icons.js';
import { describeTransaction, signedAmount } from '../../lib/aggregate.js';
import { formatDate, formatSignedEUR, formatEUR } from '../../lib/format.js';
import { baselineCategory, selectColorMaps } from '../../state/selectors.js';
import { swatch } from '../../components/common.js';

function categoryCell(tx, state, categories) {
  if (tx.kind === 'transfer') return html`<span class="muted" aria-label="Nessuna categoria">—</span>`;
  const description = describeTransaction(tx);
  const options = categories[tx.kind].includes(tx.category) ? categories[tx.kind] : [tx.category, ...categories[tx.kind]];
  const colorVar = selectColorMaps(state)[tx.kind].colorOf(tx.category);

  let note = '';
  if (tx.source === 'manual') {
    note = html`<span class="cat-note">Era <s>${baselineCategory(state, tx)}</s>
      <button type="button" class="link-btn" data-action="reset">${icon('undo', { size: 12 })}Ripristina</button></span>`;
  } else if (tx.source === 'rule') {
    note = html`<span class="cat-note">${icon('rule', { size: 12 })}Da regola · era ${tx.sourceCategory ?? '—'}</span>`;
  }

  return html`<div class="cat-cell">
      ${swatch(colorVar)}
      <select class="input input-compact" data-action="category" data-id="${tx.id}" aria-label="Categoria di ${description}">
        ${options.map((name) => html`<option value="${name}" ${name === tx.category ? raw('selected') : ''}>${name}</option>`)}
        <option value="__new__">Nuova categoria…</option>
      </select>
    </div>${note}`;
}

export function transactionRow(tx, state, categories) {
  const amount = tx.kind === 'transfer' ? formatEUR(tx.amount) : formatSignedEUR(signedAmount(tx));
  const secondary = [tx.comment && tx.tag ? tx.tag : null, tx.time].filter(Boolean).join(' · ');
  return html`<tr data-id="${tx.id}">
    <td class="col-date nowrap muted">${formatDate(tx.date)}</td>
    <td class="col-desc">
      <span class="cell-title">${describeTransaction(tx)}</span>
      ${secondary ? html`<span class="cell-sub">${secondary}</span>` : ''}
    </td>
    <td class="col-category">${categoryCell(tx, state, categories)}</td>
    <td class="col-account nowrap">${tx.toAccount ? html`${tx.account} ${icon('arrow-right', { size: 12 })} ${tx.toAccount}` : tx.account}</td>
    <td class="col-amount num nowrap strong amount-${tx.kind}">${amount}</td>
    <td class="col-actions">
      ${tx.kind === 'transfer' ? '' : html`<button type="button" class="icon-btn" data-action="rule" title="Crea una regola da questo movimento" aria-label="Crea una regola da ${describeTransaction(tx)}">${icon('rule')}</button>`}
    </td>
  </tr>`;
}
