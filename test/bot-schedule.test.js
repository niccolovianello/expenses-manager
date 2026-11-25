import test from 'node:test';
import assert from 'node:assert/strict';
import { generateInboxKeys } from '../public/js/vault/inbox-crypto.js';
import { deriveScheduleKey, importScheduleKey, openSchedule, sealSchedule } from '../public/js/vault/schedule-crypto.js';
import { buildBotSchedule, dueOn } from '../public/js/domain/bot-schedule.js';
import { announcement, notifyDue, romeClock } from '../bot/src/notify.js';
import { createRepository } from '../public/js/data/repository.js';

const recurrences = [
  { id: 'r1', kind: 'expense', amount: 12.99, account: 'Carta', toAccount: null, sourceCategory: 'Abbonamenti', tag: null, comment: 'Netflix', frequency: 'monthly', date: '2026-01-25', endDate: null, createdAt: '2026-01-02T10:00:00.000Z' },
  { id: 'r2', kind: 'income', amount: 1800, account: 'Conto', toAccount: null, sourceCategory: 'Stipendio', tag: null, comment: null, frequency: 'monthly', date: '2026-01-27', endDate: null, createdAt: '2026-01-02T10:00:00.000Z' },
  { id: 'r3', kind: 'expense', amount: 5, account: 'Carta', toAccount: null, sourceCategory: 'Altro', tag: null, comment: 'Finito', frequency: 'daily', date: '2026-01-01', endDate: '2026-03-01', createdAt: '2026-01-01T10:00:00.000Z' },
];
const topUps = [
  { id: 't1', account: 'Conto', toAccount: 'Satispay', target: 50, frequency: 'weekly', date: '2026-11-02', endDate: null, createdAt: '2026-11-01T00:00:00.000Z', settled: [{ date: '2026-11-02', amount: 10 }] },
];

test('the schedule key is the same every time for a key pair, and different for another', async () => {
  const first = await generateInboxKeys();
  const a = await deriveScheduleKey(first.privateJwk);
  assert.equal(a, await deriveScheduleKey(first.privateJwk));
  assert.notEqual(a, await deriveScheduleKey((await generateInboxKeys()).privateJwk));
  assert.equal(atob(a).length, 32);
  await assert.rejects(() => deriveScheduleKey(first.publicJwk));
});

test('a sealed schedule opens only with its key', async () => {
  const key = await importScheduleKey(await deriveScheduleKey((await generateInboxKeys()).privateJwk));
  const other = await importScheduleKey(await deriveScheduleKey((await generateInboxKeys()).privateJwk));
  const sealed = await sealSchedule(key, { hello: 'world' });
  assert.deepEqual(await openSchedule(key, sealed), { hello: 'world' });
  await assert.rejects(() => openSchedule(other, sealed), /different key/);
  await assert.rejects(() => importScheduleKey('c2hvcnQ='), /32 bytes/);
});

test('the schedule keeps only what the bot announces', () => {
  const schedule = buildBotSchedule({ recurrences, topUps });
  assert.deepEqual(schedule.recurrences[0], { kind: 'expense', amount: 12.99, account: 'Carta', toAccount: null, category: 'Abbonamenti', comment: 'Netflix', frequency: 'monthly', date: '2026-01-25', endDate: null });
  assert.deepEqual(schedule.topUps[0], { account: 'Conto', toAccount: 'Satispay', target: 50, frequency: 'weekly', date: '2026-11-02', endDate: null });
});

test('only the rules with an occurrence that day are due', () => {
  const schedule = buildBotSchedule({ recurrences, topUps });
  assert.deepEqual(dueOn(schedule, '2026-11-25').recurrences.map((rule) => rule.comment), ['Netflix']);
  assert.equal(dueOn(schedule, '2026-11-25').topUps.length, 0);
  assert.equal(dueOn(schedule, '2026-11-23').topUps.length, 1, 'every Monday');
  assert.equal(dueOn(schedule, '2026-11-26').recurrences.length, 0, 'ended daily rule is not due');
  assert.deepEqual(dueOn(null, '2026-11-25'), { recurrences: [], topUps: [] });
});

test('the morning message lists them, or is null', () => {
  const schedule = buildBotSchedule({ recurrences, topUps });
  assert.equal(announcement(dueOn(schedule, '2026-11-26')), null);
  const text = announcement({ recurrences: schedule.recurrences.slice(0, 2), topUps: schedule.topUps });
  const lines = text.split('\n');
  assert.equal(lines[0], 'Oggi in automatico (3):');
  assert.match(lines[1], /^🔁 12,99\s€ · Abbonamenti · Carta — Netflix$/);
  assert.match(lines[2], /^🔁 \+1\.800,00\s€ · Stipendio · Conto$/);
  assert.match(lines[3], /^🔄 Ricarica di Satispay fino a 50,00\s€ · da Conto$/);
});

test('Rome time, in winter and summer', () => {
  assert.deepEqual(romeClock(new Date('2026-11-25T07:00:00Z')), { day: '2026-11-25', hour: 8 });
  assert.deepEqual(romeClock(new Date('2026-07-01T06:00:00Z')), { day: '2026-07-01', hour: 8 });
  assert.deepEqual(romeClock(new Date('2026-11-25T23:30:00Z')), { day: '2026-11-26', hour: 0 });
});

test('the app writes a schedule that the bot opens and announces', async () => {
  const blobs = new Map();
  let written = null;
  const storage = {
    read: async (name) => blobs.get(name) ?? null,
    write: async (name, value) => { blobs.set(name, structuredClone(value)); },
    writeBotSchedule: async (doc) => { written = doc; },
  };
  const repo = createRepository(storage);
  await repo.writeBotSchedule(buildBotSchedule({ recurrences, topUps }));
  assert.equal(written, null, 'nothing before Telegram is set up');

  const setup = await repo.createInboxKey();
  assert.ok(setup.scheduleKey);
  assert.equal((await repo.inboxSetup()).scheduleKey, setup.scheduleKey);
  await repo.writeBotSchedule(buildBotSchedule({ recurrences, topUps }));
  assert.deepEqual(Object.keys(written).sort(), ['data', 'iv', 'v']);
  assert.ok(!written.data.includes('Netflix'));

  const sent = [];
  const deps = {
    telegram: { sendMessage: async (chatId, text) => sent.push({ chatId, text }) },
    firestore: { readSchedule: async () => written },
    scheduleKey: await importScheduleKey(setup.scheduleKey),
    allowedChatId: '7',
    now: () => new Date('2026-11-25T07:00:00Z'),
  };
  assert.equal(await notifyDue(deps), 'sent');
  assert.equal(sent.length, 1);
  assert.equal(sent[0].chatId, '7');
  assert.match(sent[0].text, /Netflix/);

  assert.equal(await notifyDue({ ...deps, now: () => new Date('2026-11-26T07:00:00Z') }), 'nothing today');
  assert.equal(await notifyDue({ ...deps, scheduleKey: null }), 'no SCHEDULE_KEY');
  assert.equal(await notifyDue({ ...deps, firestore: { readSchedule: async () => null } }), 'no schedule yet');
  assert.equal(sent.length, 1);
});
