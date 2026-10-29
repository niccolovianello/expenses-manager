// Template HTML con escape automatico dei valori interpolati.
const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

class SafeHtml {
  constructor(value) { this.value = value; }
  toString() { return this.value; }
}

export const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ESCAPES[char]);

export const raw = (value) => new SafeHtml(String(value));

function serialize(value) {
  if (value === null || value === undefined || value === false) return '';
  if (Array.isArray(value)) return value.map(serialize).join('');
  if (value instanceof SafeHtml) return value.value;
  return escapeHtml(value);
}

export function html(strings, ...values) {
  return new SafeHtml(strings.reduce((out, chunk, i) => out + chunk + (i < values.length ? serialize(values[i]) : ''), ''));
}

export function render(element, content) {
  element.innerHTML = serialize(content);
}

// Raccoglie gli elementi marcati con data-ref in un oggetto { nome: elemento }.
export function collectRefs(root) {
  return Object.fromEntries([...root.querySelectorAll('[data-ref]')].map((node) => [node.dataset.ref, node]));
}
