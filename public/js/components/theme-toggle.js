import { html, raw } from '../lib/html.js';
import { currentTheme, onThemeChange, setTheme } from '../lib/theme.js';

// The button names the scheme it switches to, and its glyph agrees: a moon on "Tema scuro"
// in the light scheme, a sun on "Tema chiaro" in the dark one. Both glyphs are Lucide's own
// outlines; on a switch one turns out as the other turns in (see .theme-icon in components.css).
const GLYPH = raw(`<svg class="icon theme-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
  <g class="theme-icon-moon"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></g>
  <g class="theme-icon-sun"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2m-7.07-15.07 1.41 1.41m11.32 11.32 1.41 1.41M2 12h2m16 0h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></g>
</svg>`);

const label = () => (currentTheme() === 'dark' ? 'Tema chiaro' : 'Tema scuro');

export const themeToggle = () => html`<button type="button" class="btn btn-ghost btn-sm theme-toggle" data-action="toggle-theme">${GLYPH}<span data-theme-label>${label()}</span></button>`;

export function bindThemeToggle(root) {
  root.addEventListener('click', (event) => {
    if (!event.target.closest('[data-action="toggle-theme"]')) return;
    setTheme(currentTheme() === 'dark' ? 'light' : 'dark');
  });
  onThemeChange(() => {
    for (const span of root.querySelectorAll('[data-theme-label]')) span.textContent = label();
  });
}
