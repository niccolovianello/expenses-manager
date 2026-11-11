// Light / dark scheme. With no stored choice the page follows the OS appearance;
// picking the scheme the OS already uses clears the choice, so it follows the OS again.
const KEY = 'spese.theme';
const system = window.matchMedia('(prefers-color-scheme: dark)');
const BAR_COLOR = { light: '#eceef2', dark: '#16181b' }; // --rail in each scheme

const systemTheme = () => (system.matches ? 'dark' : 'light');

function storedTheme() {
  try {
    const value = localStorage.getItem(KEY);
    return value === 'light' || value === 'dark' ? value : null;
  } catch {
    return null;
  }
}

export const currentTheme = () => (document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');

function apply(theme) {
  document.documentElement.dataset.theme = theme;
  for (const meta of document.querySelectorAll('meta[name="theme-color"]')) meta.content = BAR_COLOR[theme];
  document.dispatchEvent(new CustomEvent('themechange', { detail: theme }));
}

export function setTheme(theme) {
  try {
    if (theme === systemTheme()) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, theme);
  } catch { /* private mode: the choice lasts until reload */ }
  apply(theme);
}

export function initTheme() {
  apply(storedTheme() ?? systemTheme());
  system.addEventListener('change', () => {
    if (!storedTheme()) apply(systemTheme());
  });
}

export function onThemeChange(callback) {
  document.addEventListener('themechange', callback);
}
