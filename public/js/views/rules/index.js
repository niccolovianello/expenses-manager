import { html, render, collectRefs } from '../../lib/html.js';
import { mountRuleForm } from './rule-form.js';
import { mountRuleList } from './rule-list.js';
import { mountCategoryTable } from './category-table.js';
import { mountOverrideList } from './override-list.js';

export function mountRules(element, store, actions) {
  render(element, html`
    <header class="view-head">
      <div class="view-heading">
        <h1 class="view-title">Categorie e regole</h1>
        <p class="view-sub">Ordine di precedenza: correzione manuale, poi la prima regola che corrisponde, poi la categoria dell'export.</p>
      </div>
    </header>
    <div class="grid grid-rules">
      <div class="stack">
        <section class="panel" data-ref="form"></section>
        <section class="panel" data-ref="list"></section>
      </div>
      <div class="stack">
        <section class="panel" data-ref="categories"></section>
        <section class="panel" data-ref="overrides"></section>
      </div>
    </div>`);

  const refs = collectRefs(element);
  mountRuleForm(refs.form, store, actions);
  mountRuleList(refs.list, store, actions);
  mountCategoryTable(refs.categories, store, actions);
  mountOverrideList(refs.overrides, store, actions);
}
