import {
  addDays, addMonths, diffDays, endOfMonth, endOfYear, isEndOfMonth, maxISO, minISO, monthsBetween,
  startOfMonth, startOfQuarter, startOfWeek, startOfYear,
} from './dates.js';

export const PRESETS = [
  { id: 'month', label: 'Questo mese', range: (today) => ({ from: startOfMonth(today), to: today }) },
  {
    id: 'prev-month',
    label: 'Mese scorso',
    range: (today) => {
      const from = startOfMonth(addMonths(today, -1));
      return { from, to: endOfMonth(from) };
    },
  },
  { id: '3m', label: '3 mesi', range: (today) => ({ from: startOfMonth(addMonths(today, -2)), to: today }) },
  { id: '12m', label: '12 mesi', range: (today) => ({ from: startOfMonth(addMonths(today, -11)), to: today }) },
  { id: 'ytd', label: "Quest'anno", range: (today) => ({ from: startOfYear(today), to: today }) },
  {
    id: 'prev-year',
    label: 'Anno scorso',
    range: (today) => {
      const from = startOfYear(addMonths(startOfYear(today), -12));
      return { from, to: endOfYear(from) };
    },
  },
  { id: 'all', label: 'Tutto', range: (today, extent) => extent ?? { from: startOfYear(today), to: today } },
];

export const DEFAULT_PRESET = '12m';

export const GRANULARITIES = [
  { id: 'auto', label: 'Automatico' },
  { id: 'day', label: 'Giorno' },
  { id: 'week', label: 'Settimana' },
  { id: 'month', label: 'Mese' },
  { id: 'quarter', label: 'Trimestre' },
  { id: 'year', label: 'Anno' },
];

const GRANULARITY_ORDER = ['day', 'week', 'month', 'quarter', 'year'];
const MAX_BUCKETS = 120;

export function presetRange(id, today, extent) {
  const preset = PRESETS.find((candidate) => candidate.id === id) ?? PRESETS.find((p) => p.id === DEFAULT_PRESET);
  return preset.range(today, extent);
}

// A month-aligned period shifts by whole months (a year if it starts in January);
// a free period shifts by its length in days.
function alignedMonths(range) {
  if (range.from !== startOfMonth(range.from)) return 0;
  const span = monthsBetween(range.from, range.to) + 1;
  return range.from === startOfYear(range.from) && span <= 12 ? 12 : span;
}

export function shiftRange(range, direction) {
  const months = alignedMonths(range);
  if (months) {
    const shiftedTo = addMonths(range.to, direction * months);
    return {
      from: addMonths(range.from, direction * months),
      to: isEndOfMonth(range.to) ? endOfMonth(shiftedTo) : shiftedTo,
    };
  }
  const length = diffDays(range.from, range.to) + 1;
  return { from: addDays(range.from, direction * length), to: addDays(range.to, direction * length) };
}

export const comparisonRange = (period) => (period.preset === 'all' ? null : shiftRange(period, -1));

// ‹ › move to the adjacent whole period: from "Questo mese" (1–2 Nov) back to all of October,
// from "Quest'anno" to the whole previous year. Never past today; null when there is nothing ahead.
// (The comparison instead keeps the same stretch of the previous period: see shiftRange.)
export function stepRange(range, direction, today) {
  if (direction > 0 && range.to >= today) return null;
  const months = alignedMonths(range);
  let next;
  if (months) {
    const from = addMonths(range.from, direction * months);
    next = { from, to: endOfMonth(addMonths(from, months - 1)) };
  } else {
    next = shiftRange(range, direction);
  }
  if (next.from > today) return null;
  return { from: next.from, to: minISO(next.to, today) };
}

// The preset whose range is exactly this one, so a stepped period keeps a familiar name.
export function matchingPreset(range, today) {
  return PRESETS.find((preset) => preset.id !== 'all'
    && ['from', 'to'].every((key) => preset.range(today)[key] === range[key]))?.id ?? null;
}

// A name for a custom range that is a whole month or a whole year ("Ottobre 2026", "2025"), or null.
export function wholePeriod(range) {
  if (range.from !== startOfMonth(range.from) || range.to !== endOfMonth(range.to)) return null;
  const months = monthsBetween(range.from, range.to) + 1;
  if (months === 1) return { unit: 'month', key: range.from };
  if (months === 12 && range.from === startOfYear(range.from)) return { unit: 'year', key: range.from };
  return null;
}

export function bucketStart(iso, granularity) {
  switch (granularity) {
    case 'day': return iso;
    case 'week': return startOfWeek(iso);
    case 'month': return startOfMonth(iso);
    case 'quarter': return startOfQuarter(iso);
    default: return startOfYear(iso);
  }
}

function bucketEnd(start, granularity) {
  switch (granularity) {
    case 'day': return start;
    case 'week': return addDays(start, 6);
    case 'month': return endOfMonth(start);
    case 'quarter': return endOfMonth(addMonths(start, 2));
    default: return endOfYear(start);
  }
}

function autoGranularity(days) {
  if (days <= 35) return 'day';
  if (days <= 130) return 'week';
  if (days <= 1100) return 'month';
  return 'quarter';
}

const approximateBuckets = (days, granularity) =>
  days / { day: 1, week: 7, month: 30.4, quarter: 91.3, year: 365 }[granularity];

// The user's choice is coarsened only if it would produce too many bars.
export function resolveGranularity(choice, range) {
  const days = diffDays(range.from, range.to) + 1;
  let granularity = choice === 'auto' ? autoGranularity(days) : choice;
  let index = GRANULARITY_ORDER.indexOf(granularity);
  while (approximateBuckets(days, granularity) > MAX_BUCKETS && index < GRANULARITY_ORDER.length - 1) {
    granularity = GRANULARITY_ORDER[++index];
  }
  return granularity;
}

export function enumerateBuckets(range, granularity) {
  const buckets = [];
  let start = bucketStart(range.from, granularity);
  while (start <= range.to) {
    const end = bucketEnd(start, granularity);
    buckets.push({ key: start, from: maxISO(start, range.from), to: minISO(end, range.to) });
    start = addDays(end, 1);
  }
  return buckets;
}
