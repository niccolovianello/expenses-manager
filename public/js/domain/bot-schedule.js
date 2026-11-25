// What the Telegram bot needs to announce the automatic movements on their day: the recurring
// transactions and the automatic top-ups, as rules. Sealed with the schedule key before it leaves
// the app (vault/schedule-crypto.js), so Firestore never sees it in plain text.
import { occurrenceDates } from './recurring.js';

export function buildBotSchedule({ recurrences, topUps }) {
  return {
    v: 1,
    recurrences: recurrences.map((recurrence) => ({
      kind: recurrence.kind,
      amount: recurrence.amount,
      account: recurrence.account,
      toAccount: recurrence.toAccount ?? null,
      category: recurrence.sourceCategory ?? null,
      comment: recurrence.comment ?? null,
      frequency: recurrence.frequency,
      date: recurrence.date,
      endDate: recurrence.endDate ?? null,
    })),
    topUps: topUps.map((topUp) => ({
      account: topUp.account,
      toAccount: topUp.toAccount,
      target: topUp.target,
      frequency: topUp.frequency,
      date: topUp.date,
      endDate: topUp.endDate ?? null,
    })),
  };
}

const happensOn = (rule, day) => occurrenceDates(rule, day).at(-1) === day;

// The rules with an occurrence on `day`. A top-up's amount depends on the balance that morning,
// which only the app knows: the bot can only say what it tops up to.
export function dueOn(schedule, day) {
  return {
    recurrences: (schedule?.recurrences ?? []).filter((rule) => happensOn(rule, day)),
    topUps: (schedule?.topUps ?? []).filter((rule) => happensOn(rule, day)),
  };
}
