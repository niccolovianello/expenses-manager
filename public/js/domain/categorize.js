// Categorization logic: computation, previews and rule validation.
// Precedence: manual override > first matching active rule > export category.
// Manually entered and recurring transactions always keep the category chosen when they were entered.

export const UNCATEGORIZED = 'Da categorizzare';

export const RULE_FIELDS = {
  comment: 'Commento',
  tag: 'Tag',
  account: 'Conto',
  sourceCategory: 'Categoria originale',
  any: 'Qualsiasi testo',
};

export const RULE_OPERATORS = {
  contains: 'contiene',
  equals: 'è uguale a',
  startsWith: 'inizia con',
};

export const RULE_KINDS = { expense: 'Uscite', income: 'Entrate' };

const SEARCHABLE_FIELDS = ['comment', 'tag', 'account'];

const normalizeText = (value) => (value ?? '').toString().trim().toLocaleLowerCase('it');

export function normalizeCategory(value) {
  const category = String(value ?? '').trim().replace(/\s+/g, ' ');
  return category && category.length <= 60 ? category : null;
}

// A rule draft from a transaction: the merchant ("Esselunga" out of "Esselunga — spesa settimanale")
// rather than the whole description, so the rule also catches the next ones. `category` empty
// leaves the choice to the user.
export function ruleDraftFrom(tx, category = '') {
  const field = tx.comment ? 'comment' : tx.tag ? 'tag' : 'account';
  const text = String(tx[field] ?? '').trim();
  const merchant = field === 'comment' ? text.split(/\s+[—–-]\s+|[,;:(|]|\s+\d/)[0].trim().slice(0, 40) : text;
  return { kind: tx.kind === 'income' ? 'income' : 'expense', field, operator: 'contains', value: merchant || text.slice(0, 40), category };
}

export function normalizeRule(input = {}) {
  if (!(input.field in RULE_FIELDS)) return { error: 'Scegli il campo da controllare' };
  if (!(input.operator in RULE_OPERATORS)) return { error: 'Scegli come confrontare il testo' };
  const value = String(input.value ?? '').trim();
  if (!value) return { error: 'Scrivi il testo da cercare' };
  if (value.length > 100) return { error: 'Il testo da cercare può avere al massimo 100 caratteri' };
  const category = normalizeCategory(input.category);
  if (!category) return { error: 'Scegli la categoria da assegnare' };
  return {
    rule: {
      kind: input.kind === 'income' ? 'income' : 'expense',
      field: input.field,
      operator: input.operator,
      value,
      category,
      enabled: input.enabled !== false,
    },
  };
}

function compare(operator, haystack, needle) {
  if (operator === 'equals') return haystack === needle;
  if (operator === 'startsWith') return haystack.startsWith(needle);
  return haystack.includes(needle);
}

export function ruleMatches(rule, tx) {
  if (rule.kind !== tx.kind) return false;
  const needle = normalizeText(rule.value);
  if (!needle) return false;
  const fields = rule.field === 'any' ? SEARCHABLE_FIELDS : [rule.field];
  return fields.some((field) => compare(rule.operator, normalizeText(tx[field]), needle));
}

export function categorize(tx, { rules = [], overrides = {} } = {}) {
  if (tx.kind === 'transfer') return { category: null, source: 'transfer', ruleId: null };
  // A manual or recurring transaction has the category chosen by whoever entered it: rules do not change it.
  if (tx.origin === 'manual' || tx.origin === 'recurring') return { category: tx.sourceCategory || UNCATEGORIZED, source: 'entry', ruleId: null };
  if (overrides[tx.id]) return { category: overrides[tx.id], source: 'manual', ruleId: null };
  const rule = rules.find((candidate) => candidate.enabled !== false && ruleMatches(candidate, tx));
  if (rule) return { category: rule.category, source: 'rule', ruleId: rule.id };
  if (tx.sourceCategory) return { category: tx.sourceCategory, source: 'origin', ruleId: null };
  return { category: UNCATEGORIZED, source: 'none', ruleId: null };
}

export function applyCategorization(transactions, config) {
  return transactions.map((tx) => ({ ...tx, ...categorize(tx, config) }));
}

export function describeRule(rule) {
  return `${RULE_FIELDS[rule.field]} ${RULE_OPERATORS[rule.operator]} “${rule.value}”`;
}
