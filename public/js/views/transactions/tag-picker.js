import { html, render, collectRefs } from '../../lib/html.js';
import { icon } from '../../lib/icons.js';

// Beyond this many, the least used tags wait behind "Altri N" (or the search).
const VISIBLE = 12;
const cleanTag = (value) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, 60);
const sameTag = (a, b) => a.localeCompare(b, 'it', { sensitivity: 'base' }) === 0;

// Tag field of the transaction form: the tags already used, as chips to pick one of (or none).
// A new tag is created on purpose, from "Aggiungi tag", so a typo does not become a tag.
// The value lives in a hidden input named `tag`, so the form reads it like any other field.
export function mountTagPicker(element) {
  render(element, html`
    <div class="tag-picker-head">
      <span class="field-label" id="tag-picker-label">Tag <span class="field-optional">facoltativo</span></span>
      <button type="button" class="icon-btn" data-ref="searchToggle" aria-label="Cerca un tag" aria-expanded="false" aria-controls="tag-picker-search">${icon('search')}</button>
    </div>
    <div data-ref="pick">
      <input class="input tag-search" type="search" id="tag-picker-search" data-ref="search" placeholder="Cerca un tag" autocomplete="off" aria-label="Cerca un tag" hidden>
      <div class="tag-chips" data-ref="chips" role="group" aria-labelledby="tag-picker-label"></div>
    </div>
    <div class="tag-create" data-ref="create" hidden>
      <label class="field"><span class="field-label">Nome del nuovo tag</span>
        <input class="input" data-ref="name" maxlength="60" autocomplete="off" placeholder="es. Benzina" aria-describedby="tag-create-hint"></label>
      <p class="field-hint" id="tag-create-hint" data-ref="hint" aria-live="polite"></p>
      <div class="tag-create-actions">
        <button type="button" class="btn btn-primary btn-sm" data-ref="confirm">${icon('plus')}Crea tag</button>
        <button type="button" class="btn btn-ghost btn-sm" data-ref="cancel">Annulla</button>
      </div>
    </div>
    <input type="hidden" name="tag" data-ref="value">`);

  const refs = collectRefs(element);
  let known = [];
  // Created here but not saved yet: they stay on offer until the page reloads.
  const created = [];
  let expanded = false;

  const value = () => refs.value.value;
  const allTags = () => [...created.filter((tag) => !known.some((k) => sameTag(k, tag))), ...known];
  const query = () => (refs.search.hidden ? '' : cleanTag(refs.search.value).toLocaleLowerCase('it'));

  function visibleTags() {
    const current = value();
    let tags = allTags();
    // A tag no longer in use (an older transaction) is still shown, selected.
    if (current && !tags.includes(current)) tags = [current, ...tags];
    const text = query();
    if (text) return { tags: tags.filter((tag) => tag.toLocaleLowerCase('it').includes(text)), hidden: 0 };
    if (expanded || tags.length <= VISIBLE + 1) return { tags, hidden: 0 };
    const shown = tags.slice(0, VISIBLE);
    if (current && !shown.includes(current)) shown.push(current);
    return { tags: shown, hidden: tags.length - shown.length };
  }

  function draw() {
    const current = value();
    const { tags, hidden } = visibleTags();
    const text = cleanTag(refs.search.value);
    render(refs.chips, html`
      ${tags.map((tag) => html`<button type="button" class="chip chip-tag" data-tag="${tag}" aria-pressed="${String(tag === current)}">${tag}</button>`)}
      ${hidden ? html`<button type="button" class="chip chip-more" data-action="more">Altri ${hidden}</button>` : ''}
      ${query() && !tags.length ? html`<span class="tag-empty">Nessun tag con “${text}”</span>` : ''}
      <button type="button" class="chip chip-add" data-action="add">${icon('plus', { size: 14 })}${query() && !tags.length ? html`Crea “${text}”` : 'Aggiungi tag'}</button>`);
  }

  function setValue(next) {
    refs.value.value = cleanTag(next);
    draw();
  }

  function closeSearch() {
    refs.search.value = '';
    refs.search.hidden = true;
    refs.searchToggle.setAttribute('aria-expanded', 'false');
  }

  // "Aggiungi tag" swaps the chips for the creation view; leaving it brings them back.
  function openCreate(name = '') {
    refs.pick.hidden = true;
    refs.searchToggle.hidden = true;
    refs.create.hidden = false;
    refs.name.value = name;
    syncHint();
    refs.name.focus();
  }

  function closeCreate() {
    refs.create.hidden = true;
    refs.pick.hidden = false;
    refs.searchToggle.hidden = false;
    closeSearch();
    draw();
  }

  const existing = (name) => allTags().find((tag) => sameTag(tag, name));
  function syncHint() {
    const name = cleanTag(refs.name.value);
    const match = name && existing(name);
    refs.hint.textContent = match ? `Esiste già “${match}”: verrà selezionato.` : '';
    refs.hint.hidden = !match;
    refs.hint.classList.remove('field-error');
  }

  function commitCreate() {
    const name = cleanTag(refs.name.value);
    if (!name) {
      refs.hint.textContent = 'Scrivi il nome del tag.';
      refs.hint.hidden = false;
      refs.hint.classList.add('field-error');
      refs.name.focus();
      return;
    }
    const tag = existing(name) ?? name;
    if (!existing(name)) created.unshift(tag);
    refs.value.value = tag;
    closeCreate();
    refs.chips.querySelector(`[data-tag="${CSS.escape(tag)}"]`)?.focus();
  }

  function cancelCreate() {
    closeCreate();
    refs.chips.querySelector('[data-action="add"]')?.focus();
  }

  refs.chips.addEventListener('click', (event) => {
    const chip = event.target.closest('[data-tag]');
    if (chip) {
      // Tapping the chosen tag again leaves the transaction without one.
      setValue(chip.dataset.tag === value() ? '' : chip.dataset.tag);
      refs.chips.querySelector(`[data-tag="${CSS.escape(chip.dataset.tag)}"]`)?.focus();
      return;
    }
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (action === 'more') {
      expanded = true;
      draw();
      refs.chips.querySelectorAll('[data-tag]')[VISIBLE]?.focus();
    }
    if (action === 'add') openCreate(query() ? cleanTag(refs.search.value) : '');
  });

  refs.searchToggle.addEventListener('click', () => {
    if (refs.search.hidden) {
      refs.search.hidden = false;
      refs.searchToggle.setAttribute('aria-expanded', 'true');
      refs.search.focus();
    } else {
      closeSearch();
      refs.searchToggle.focus();
    }
    draw();
  });

  refs.search.addEventListener('input', draw);
  refs.search.addEventListener('keydown', (event) => {
    // Enter picks the only tag found (or offers to create it) instead of saving the form.
    if (event.key === 'Enter') {
      event.preventDefault();
      const { tags } = visibleTags();
      if (tags.length === 1) {
        setValue(tags[0]);
        closeSearch();
        draw();
        refs.chips.querySelector(`[data-tag="${CSS.escape(tags[0])}"]`)?.focus();
      } else if (!tags.length && query()) {
        openCreate(cleanTag(refs.search.value));
      }
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      closeSearch();
      draw();
      refs.searchToggle.focus();
    }
  });

  refs.name.addEventListener('input', syncHint);
  refs.name.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') { event.preventDefault(); commitCreate(); }
    if (event.key === 'Escape') { event.preventDefault(); cancelCreate(); }
  });
  refs.confirm.addEventListener('click', commitCreate);
  refs.cancel.addEventListener('click', cancelCreate);

  draw();
  return {
    setValue,
    // The form opens fresh: back to the chips, nothing searched, the long list folded again.
    reset(next = '') {
      if (!refs.create.hidden) closeCreate();
      closeSearch();
      expanded = false;
      setValue(next);
    },
    setTags(tags) {
      if (tags === known) return;
      known = tags;
      draw();
    },
  };
}
