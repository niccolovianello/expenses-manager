import { groupTotals } from '../lib/aggregate.js';

// Le categorie più pesanti di sempre ricevono un colore fisso; le altre confluiscono in "Altre".
// Il colore segue la categoria, non la sua posizione nel periodo selezionato.
export const SLOT_COUNT = 7;
export const OTHER_KEY = '__other__';
export const OTHER_LABEL = 'Altre categorie';
export const OTHER_COLOR = '--series-other';

export function buildColorMap(categorized, kind) {
  const ranked = groupTotals(categorized.filter((tx) => tx.kind === kind), (tx) => tx.category);
  const slots = new Map(ranked.slice(0, SLOT_COUNT).map((group, index) => [group.key, `--series-${index + 1}`]));
  return {
    slotted: [...slots.keys()],
    has: (category) => slots.has(category),
    colorOf: (category) => slots.get(category) ?? OTHER_COLOR,
  };
}
