// Runs in <head>, before first paint, so a stored dark choice never flashes light.
// Classic script (not a module) because the CSP forbids inline scripts.
(function () {
  var theme = null;
  try { theme = localStorage.getItem('spese.theme'); } catch (error) { /* private mode */ }
  if (theme !== 'light' && theme !== 'dark') {
    theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  document.documentElement.dataset.theme = theme;
  // The browser bar takes --rail; the metas in index.html only know the OS scheme.
  var bar = theme === 'dark' ? '#16181b' : '#eceef2';
  var metas = document.querySelectorAll('meta[name="theme-color"]');
  for (var i = 0; i < metas.length; i++) metas[i].content = bar;
})();
