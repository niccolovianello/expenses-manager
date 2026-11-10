import test from 'node:test';
import assert from 'node:assert/strict';
import { comparisonRange, enumerateBuckets, matchingPreset, presetRange, remainingRange, resolveGranularity, shiftRange, stepRange, stepUnit, wholePeriod } from '../public/js/lib/periods.js';

const today = '2026-10-29';

test('presets start at the beginning of a month or year', () => {
  assert.deepEqual(presetRange('month', today), { from: '2026-10-01', to: today });
  assert.deepEqual(presetRange('prev-month', today), { from: '2026-09-01', to: '2026-09-30' });
  assert.deepEqual(presetRange('12m', today), { from: '2025-11-01', to: today });
  assert.deepEqual(presetRange('prev-year', today), { from: '2025-01-01', to: '2025-12-31' });
});

test('the comparison uses the same stretch of the previous period', () => {
  assert.deepEqual(comparisonRange({ preset: 'month', from: '2026-10-01', to: today }), { from: '2026-09-01', to: '2026-09-29' });
  assert.deepEqual(comparisonRange({ preset: 'ytd', from: '2026-01-01', to: today }), { from: '2025-01-01', to: '2025-10-29' });
  assert.equal(comparisonRange({ preset: 'all', from: '2024-01-02', to: today }), null);
});

test('a free period shifts by its length', () => {
  assert.deepEqual(shiftRange({ from: '2026-10-10', to: '2026-10-19' }, -1), { from: '2026-09-30', to: '2026-10-09' });
});

test('a complete month stays complete when shifted', () => {
  assert.deepEqual(shiftRange({ from: '2026-02-01', to: '2026-02-28' }, 1), { from: '2026-03-01', to: '2026-03-31' });
});

test('automatic granularity follows the length and stays within the bar limit', () => {
  assert.equal(resolveGranularity('auto', { from: '2026-10-01', to: today }), 'day');
  assert.equal(resolveGranularity('auto', { from: '2026-08-01', to: today }), 'week');
  assert.equal(resolveGranularity('auto', { from: '2025-11-01', to: today }), 'month');
  assert.equal(resolveGranularity('day', { from: '2024-01-01', to: today }), 'month');
  assert.equal(resolveGranularity('day', { from: '2026-01-01', to: today }), 'week');
});

test('intervals cover the period without gaps', () => {
  const buckets = enumerateBuckets({ from: '2026-10-15', to: '2026-12-10' }, 'month');
  assert.deepEqual(buckets.map((b) => [b.from, b.to]), [
    ['2026-10-15', '2026-10-31'],
    ['2026-11-01', '2026-11-30'],
    ['2026-12-01', '2026-12-10'],
  ]);
});

test('‹ › step to the adjacent whole month or year, never past today', () => {
  const month = presetRange('month', today);
  assert.deepEqual(stepRange(month, -1, today), { from: '2026-09-01', to: '2026-09-30' });
  assert.equal(stepRange(month, 1, today), null);
  assert.deepEqual(stepRange({ from: '2026-09-01', to: '2026-09-30' }, 1, today), { from: '2026-10-01', to: today });
  assert.deepEqual(stepRange(presetRange('ytd', today), -1, today), { from: '2025-01-01', to: '2025-12-31' });
  assert.deepEqual(stepRange(presetRange('12m', today), -1, today), { from: '2024-11-01', to: '2025-10-31' });
  assert.deepEqual(stepRange({ from: '2026-10-10', to: '2026-10-19' }, 1, today), { from: '2026-10-20', to: today });
});

test('‹ › move by a day from a single day and by a whole week from a week', () => {
  assert.deepEqual(stepRange(presetRange('today', today), -1, today), { from: '2026-10-28', to: '2026-10-28' });
  assert.equal(stepRange(presetRange('today', today), 1, today), null);
  const week = { preset: 'week', ...presetRange('week', today) };
  assert.deepEqual(week, { preset: 'week', from: '2026-10-26', to: today });
  assert.deepEqual(stepRange(week, -1, today), { from: '2026-10-19', to: '2026-10-25' });
  assert.deepEqual(stepRange({ from: '2026-10-19', to: '2026-10-25' }, 1, today), { from: '2026-10-26', to: today });
  assert.deepEqual(comparisonRange(week), { from: '2026-10-19', to: '2026-10-22' });
});

test('on a Monday "Questa settimana" steps by weeks and "Oggi" by days', () => {
  const monday = '2026-11-02';
  const week = { preset: 'week', ...presetRange('week', monday) };
  const day = { preset: 'today', ...presetRange('today', monday) };
  assert.deepEqual(stepRange(week, -1, monday), { from: '2026-10-26', to: '2026-11-01' });
  assert.deepEqual(stepRange(day, -1, monday), { from: '2026-11-01', to: '2026-11-01' });
  assert.equal(matchingPreset({ from: monday, to: monday }, monday, stepUnit({ from: '2026-10-26', to: '2026-11-01' })), 'week');
  assert.equal(matchingPreset({ from: monday, to: monday }, monday, stepUnit({ from: '2026-11-01', to: '2026-11-01' })), 'today');
});

test('on the 1st "Questo mese" steps by months and a single day by days', () => {
  const first = '2026-11-01';
  assert.deepEqual(stepRange({ preset: 'month', ...presetRange('month', first) }, -1, first), { from: '2026-10-01', to: '2026-10-31' });
  assert.deepEqual(stepRange({ preset: 'today', ...presetRange('today', first) }, -1, first), { from: '2026-10-31', to: '2026-10-31' });
  assert.deepEqual(stepRange({ preset: 'custom', from: first, to: first }, 1, '2026-11-02'), { from: '2026-11-02', to: '2026-11-02' });
  assert.equal(matchingPreset({ from: first, to: first }, first, stepUnit({ from: '2026-10-01', to: '2026-10-31' })), 'month');
});

test('a stepped period takes the name of the preset it matches, or of its month or year', () => {
  assert.equal(matchingPreset({ from: '2026-10-01', to: today }, today), 'month');
  assert.equal(matchingPreset({ from: '2026-09-01', to: '2026-09-30' }, today), 'prev-month');
  assert.equal(matchingPreset({ from: '2026-08-01', to: '2026-08-31' }, today), null);
  assert.deepEqual(wholePeriod({ from: '2026-08-01', to: '2026-08-31' }), { unit: 'month', key: '2026-08-01' });
  assert.deepEqual(wholePeriod({ from: '2024-01-01', to: '2024-12-31' }), { unit: 'year', key: '2024-01-01' });
  assert.equal(wholePeriod({ from: '2026-08-01', to: '2026-08-20' }), null);
});

test('what is still to come in the current day, week or month starts tomorrow', () => {
  const today = '2026-11-10';
  const period = (preset, day = today) => ({ preset, ...presetRange(preset, day, null) });
  assert.deepEqual(remainingRange(period('today'), today), { from: '2026-11-11', to: '2026-11-11' });
  assert.deepEqual(remainingRange(period('week'), today), { from: '2026-11-11', to: '2026-11-15' });
  assert.deepEqual(remainingRange(period('month'), today), { from: '2026-11-11', to: '2026-11-30' });
  assert.equal(remainingRange(period('week', '2026-11-15'), '2026-11-15'), null);
  assert.equal(remainingRange(period('month', '2026-11-30'), '2026-11-30'), null);
  assert.equal(remainingRange(period('prev-month'), today), null);
  assert.equal(remainingRange(period('ytd'), today), null);
  assert.equal(remainingRange({ preset: 'month', from: '2026-10-01', to: '2026-10-31' }, today), null);
});
