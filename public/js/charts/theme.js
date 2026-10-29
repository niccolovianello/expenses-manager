// I colori dei grafici vengono dai token CSS: un solo posto per tema chiaro e scuro.
export const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

export function applyChartDefaults(Chart) {
  Chart.defaults.font.family = cssVar('--font-sans');
  Chart.defaults.font.size = 12;
  Chart.defaults.color = cssVar('--text-2');
  Chart.defaults.borderColor = cssVar('--grid');
  const tooltip = Chart.defaults.plugins.tooltip;
  tooltip.backgroundColor = cssVar('--tooltip-bg');
  tooltip.titleColor = cssVar('--tooltip-text');
  tooltip.bodyColor = cssVar('--tooltip-text');
  tooltip.footerColor = cssVar('--tooltip-text');
  tooltip.padding = 10;
  tooltip.cornerRadius = 8;
  tooltip.boxPadding = 4;
  tooltip.titleFont = { weight: '600' };
  tooltip.footerFont = { weight: '600' };
}

export function onThemeChange(callback) {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', callback);
}
