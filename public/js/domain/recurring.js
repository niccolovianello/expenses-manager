import { addDays, addMonths } from '../lib/dates.js';
import { isValidDate, normalizeEntry } from './entries.js';

// Movements that repeat from a base date: same fields as a manual transaction, plus how often
// they repeat and, optionally, the last day they can happen. Every occurrence up to today
// becomes a transaction of its own (origin 'recurring'), computed and never stored.
export const FREQUENCIES = { daily: 'Ogni giorno', weekly: 'Ogni settimana', monthly: 'Ogni mese', yearly: 'Ogni anno' };

// A base date typed with the wrong year would generate a huge number of occurrences.
const EARLIEST = '2000-01-01';

// On error, `field` says which field to fix.
export function normalizeRecurrence(input = {}) {
  if (!(input.frequency in FREQUENCIES)) return { error: 'Scegli ogni quanto si ripete', field: 'frequency' };
  const { entry, error, field } = normalizeEntry(input);
  if (error) return { error, field };
  if (entry.date < EARLIEST) return { error: 'La data di inizio è troppo lontana', field: 'date' };
  const endDate = input.endDate || null;
  if (endDate && !isValidDate(endDate)) return { error: 'Inserisci una data di fine valida', field: 'endDate' };
  if (endDate && endDate < entry.date) return { error: 'La data di fine viene prima di quella di inizio', field: 'endDate' };
  return { recurrence: { ...entry, frequency: input.frequency, endDate } };
}

// The n-th occurrence counts from the base date, so the 31st stays the 31st after a shorter month.
export function occurrenceDate(start, frequency, n) {
  if (frequency === 'daily') return addDays(start, n);
  if (frequency === 'weekly') return addDays(start, 7 * n);
  return addMonths(start, frequency === 'yearly' ? 12 * n : n);
}

export function occurrenceDates(recurrence, until) {
  const last = recurrence.endDate && recurrence.endDate < until ? recurrence.endDate : until;
  const dates = [];
  for (let n = 0; ; n++) {
    const date = occurrenceDate(recurrence.date, recurrence.frequency, n);
    if (date > last) return dates;
    dates.push(date);
  }
}

// The first occurrence after `today`, or null when the recurrence has ended.
export function nextOccurrence(recurrence, today) {
  for (let n = 0; ; n++) {
    const date = occurrenceDate(recurrence.date, recurrence.frequency, n);
    if (recurrence.endDate && date > recurrence.endDate) return null;
    if (date > today) return date;
  }
}

// `createdAt` of an occurrence is when it moves the balances: the start of its day, or the moment
// the recurrence was created if later. Occurrences dated before that day are history the balances
// typed by hand already include, so they get none.
function occurrenceMoment(date, createdAt) {
  if (date < createdAt.slice(0, 10)) return null;
  const start = `${date}T00:00:00.000Z`;
  return start > createdAt ? start : createdAt;
}

export function expandRecurrences(recurrences, today) {
  return recurrences.flatMap(({ frequency, endDate, createdAt, updatedAt, ...recurrence }) =>
    occurrenceDates({ ...recurrence, frequency, endDate }, today).map((date) => ({
      ...recurrence,
      id: `${recurrence.id}@${date}`,
      origin: 'recurring',
      recurrenceId: recurrence.id,
      frequency,
      date,
      createdAt: occurrenceMoment(date, createdAt),
    })));
}

// Values to show in the form when editing a recurrence.
export const recurrenceInput = (recurrence) => ({
  kind: recurrence.kind,
  date: recurrence.date,
  amount: recurrence.amount,
  account: recurrence.account,
  toAccount: recurrence.toAccount,
  category: recurrence.sourceCategory,
  tag: recurrence.tag,
  comment: recurrence.comment,
  frequency: recurrence.frequency,
  endDate: recurrence.endDate,
});

// The recurrences with occurrences between `from` and `to`, each with those dates; the soonest first.
export function occurrencesBetween(recurrences, { from, to }) {
  return recurrences
    .map((recurrence) => ({ recurrence, dates: occurrenceDates(recurrence, to).filter((date) => date >= from) }))
    .filter(({ dates }) => dates.length)
    .sort((a, b) => a.dates[0].localeCompare(b.dates[0]));
}
