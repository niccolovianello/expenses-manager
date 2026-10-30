// Dates as ISO "YYYY-MM-DD" strings, computed in UTC to avoid time-zone shifts.
const DAY_MS = 86_400_000;

export const parseISO = (iso) => {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
};

export const toISO = (date) => date.toISOString().slice(0, 10);

export function todayISO() {
  const now = new Date();
  return toISO(new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())));
}

export const addDays = (iso, days) => toISO(new Date(parseISO(iso).getTime() + days * DAY_MS));

export const diffDays = (from, to) => Math.round((parseISO(to) - parseISO(from)) / DAY_MS);

export function addMonths(iso, months) {
  const date = parseISO(iso);
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + months;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return toISO(new Date(Date.UTC(year, month, Math.min(date.getUTCDate(), lastDay))));
}

export const startOfMonth = (iso) => `${iso.slice(0, 7)}-01`;

export function endOfMonth(iso) {
  const date = parseISO(iso);
  return toISO(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)));
}

export const isEndOfMonth = (iso) => endOfMonth(iso) === iso;

export const startOfYear = (iso) => `${iso.slice(0, 4)}-01-01`;

export const endOfYear = (iso) => `${iso.slice(0, 4)}-12-31`;

export function startOfWeek(iso) {
  const mondayOffset = (parseISO(iso).getUTCDay() + 6) % 7;
  return addDays(iso, -mondayOffset);
}

export function startOfQuarter(iso) {
  const firstMonth = Math.floor((Number(iso.slice(5, 7)) - 1) / 3) * 3 + 1;
  return `${iso.slice(0, 4)}-${String(firstMonth).padStart(2, '0')}-01`;
}

export const monthsBetween = (from, to) =>
  (Number(to.slice(0, 4)) - Number(from.slice(0, 4))) * 12 + Number(to.slice(5, 7)) - Number(from.slice(5, 7));

export const minISO = (a, b) => (a < b ? a : b);
export const maxISO = (a, b) => (a > b ? a : b);
