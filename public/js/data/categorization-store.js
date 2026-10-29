import { normalizeCategory, normalizeRule } from '../domain/categorize.js';

export const emptyCategorization = () => ({ rules: [], overrides: {} });

const newId = () => crypto.randomUUID().slice(0, 8);

// Scarta regole o correzioni non valide (file salvati da versioni precedenti o modificati a mano).
export function sanitizeCategorization(data) {
  const rules = Array.isArray(data?.rules)
    ? data.rules.flatMap((input) => {
        const { rule } = normalizeRule(input);
        return rule ? [{ id: String(input.id ?? newId()), ...rule }] : [];
      })
    : [];
  const overrides = {};
  for (const [id, category] of Object.entries(data?.overrides ?? {})) {
    const normalized = normalizeCategory(category);
    if (normalized) overrides[id] = normalized;
  }
  return { rules, overrides };
}

function validRule(input) {
  const { rule, error } = normalizeRule(input);
  if (error) throw new Error(error);
  return rule;
}

function ruleIndex(state, id) {
  const index = state.rules.findIndex((rule) => rule.id === id);
  if (index === -1) throw new Error('Regola non trovata');
  return index;
}

// Modifiche pure: ricevono una copia dello stato e la aggiornano.
export const mutations = {
  setOverride(state, id, category) {
    const normalized = normalizeCategory(category);
    if (!normalized) throw new Error('Categoria non valida');
    state.overrides[id] = normalized;
  },
  clearOverride(state, id) {
    delete state.overrides[id];
  },
  addRule(state, input) {
    state.rules.push({ id: newId(), ...validRule(input) });
  },
  updateRule(state, id, input) {
    state.rules[ruleIndex(state, id)] = { id, ...validRule(input) };
  },
  deleteRule(state, id) {
    state.rules.splice(ruleIndex(state, id), 1);
  },
  moveRule(state, id, direction) {
    const index = ruleIndex(state, id);
    const target = direction === 'up' ? index - 1 : index + 1;
    if (target < 0 || target >= state.rules.length) return;
    [state.rules[index], state.rules[target]] = [state.rules[target], state.rules[index]];
  },
};
