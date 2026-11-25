// Every morning, one message with the automatic movements of the day: the occurrences of the
// recurring transactions and the automatic top-ups. The app keeps their rules in
// users/{owner}/bot/schedule, sealed with SCHEDULE_KEY (see TELEGRAM-BOT.md).
import { dueOn } from '../../public/js/domain/bot-schedule.js';
import { formatEUR } from '../../public/js/lib/format.js';
import { openSchedule } from '../../public/js/vault/schedule-crypto.js';

// Local time in Rome. Cloudflare's crons are in UTC, so wrangler.toml schedules two runs (06:00 and
// 07:00 UTC) and only the one that falls at this hour in Rome sends, in summer and in winter alike.
export const NOTIFY_HOUR = 8;

export function romeClock(date) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23',
  }).formatToParts(date).map(({ type, value }) => [type, value]));
  return { day: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour) };
}

function recurrenceLine(rule) {
  const transfer = rule.kind === 'transfer';
  const amount = `${rule.kind === 'income' ? '+' : ''}${formatEUR(rule.amount)}`;
  const where = transfer ? `${rule.account} → ${rule.toAccount}` : rule.account;
  const head = [amount, transfer ? 'Giroconto' : rule.category, where].filter(Boolean).join(' · ');
  return `🔁 ${head}${rule.comment ? ` — ${rule.comment}` : ''}`;
}

const topUpLine = (rule) => `🔄 Ricarica di ${rule.toAccount} fino a ${formatEUR(rule.target)} · da ${rule.account}`;

// The text of the morning message, or null when nothing happens today.
export function announcement(due) {
  const lines = [...due.recurrences.map(recurrenceLine), ...due.topUps.map(topUpLine)];
  if (!lines.length) return null;
  return [lines.length === 1 ? 'Oggi in automatico:' : `Oggi in automatico (${lines.length}):`, ...lines].join('\n');
}

// `deps`: { telegram, firestore, scheduleKey, allowedChatId, now() }. Returns what it did, for logs and tests.
export async function notifyDue(deps) {
  if (!deps.scheduleKey) return 'no SCHEDULE_KEY';
  if (!deps.allowedChatId) return 'no ALLOWED_CHAT_ID';
  const sealed = await deps.firestore.readSchedule();
  if (!sealed) return 'no schedule yet';
  const schedule = await openSchedule(deps.scheduleKey, sealed);
  const text = announcement(dueOn(schedule, romeClock(deps.now()).day));
  if (!text) return 'nothing today';
  await deps.telegram.sendMessage(deps.allowedChatId, text);
  return 'sent';
}
