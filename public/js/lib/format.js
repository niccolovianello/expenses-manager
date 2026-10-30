import { parseISO } from './dates.js';

const LOCALE = 'it-IT';
// useGrouping 'always': for Italian, Intl does not group thousands below 10,000 (5073 vs 12.345).
const currency = new Intl.NumberFormat(LOCALE, { style: 'currency', currency: 'EUR', useGrouping: 'always' });
const currencyRounded = new Intl.NumberFormat(LOCALE, { style: 'currency', currency: 'EUR', maximumFractionDigits: 0, useGrouping: 'always' });
const percent = new Intl.NumberFormat(LOCALE, { style: 'percent', maximumFractionDigits: 1 });
const integer = new Intl.NumberFormat(LOCALE, { useGrouping: 'always' });

const dateFormat = (options) => new Intl.DateTimeFormat(LOCALE, { timeZone: 'UTC', ...options });
const dayMonth = dateFormat({ day: 'numeric', month: 'short' });
const fullDate = dateFormat({ day: 'numeric', month: 'short', year: 'numeric' });
const longDate = dateFormat({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const shortMonth = dateFormat({ month: 'short', year: '2-digit' });
const longMonth = dateFormat({ month: 'long', year: 'numeric' });

const capitalize = (text) => text.charAt(0).toLocaleUpperCase(LOCALE) + text.slice(1);

export const formatEUR = (value) => currency.format(value);
export const formatEURRounded = (value) => currencyRounded.format(value);
export const formatAxisEUR = (value) => `${integer.format(Math.round(value))} €`;
export const formatPercent = (value) => percent.format(value);
export const formatCount = (value) => integer.format(value);

export function formatSignedEUR(value) {
  const sign = value > 0 ? '+' : value < 0 ? '−' : '';
  return `${sign}${currency.format(Math.abs(value))}`;
}

export function formatSignedPercent(value) {
  const sign = value > 0 ? '+' : value < 0 ? '−' : '';
  return `${sign}${percent.format(Math.abs(value))}`;
}

export const formatDate = (iso) => fullDate.format(parseISO(iso));
export const formatDateShort = (iso) => dayMonth.format(parseISO(iso));
export const formatDateLong = (iso) => capitalize(longDate.format(parseISO(iso)));

export function formatRange({ from, to }) {
  if (from === to) return formatDate(from);
  if (from.slice(0, 4) === to.slice(0, 4)) return `${formatDateShort(from)} – ${formatDate(to)}`;
  return `${formatDate(from)} – ${formatDate(to)}`;
}

const quarterOf = (iso) => Math.floor((Number(iso.slice(5, 7)) - 1) / 3) + 1;

export function formatBucketLabel(key, granularity) {
  switch (granularity) {
    case 'day':
    case 'week': return formatDateShort(key);
    case 'month': return shortMonth.format(parseISO(key));
    case 'quarter': return `T${quarterOf(key)} ${key.slice(2, 4)}`;
    default: return key.slice(0, 4);
  }
}

export function formatBucketTitle(bucket, granularity) {
  switch (granularity) {
    case 'day': return formatDateLong(bucket.from);
    case 'week': return `Settimana ${formatRange(bucket)}`;
    case 'month': return capitalize(longMonth.format(parseISO(bucket.key)));
    case 'quarter': return `${quarterOf(bucket.key)}° trimestre ${bucket.key.slice(0, 4)}`;
    default: return bucket.key.slice(0, 4);
  }
}

export const GRANULARITY_NOUN = { day: 'giorno', week: 'settimana', month: 'mese', quarter: 'trimestre', year: 'anno' };
