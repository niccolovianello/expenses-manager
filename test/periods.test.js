import test from 'node:test';
import assert from 'node:assert/strict';
import { comparisonRange, enumerateBuckets, presetRange, resolveGranularity, shiftRange } from '../public/js/lib/periods.js';

const today = '2026-10-29';

test('i preset partono da inizio mese o anno', () => {
  assert.deepEqual(presetRange('month', today), { from: '2026-10-01', to: today });
  assert.deepEqual(presetRange('prev-month', today), { from: '2026-09-01', to: '2026-09-30' });
  assert.deepEqual(presetRange('12m', today), { from: '2025-11-01', to: today });
  assert.deepEqual(presetRange('prev-year', today), { from: '2025-01-01', to: '2025-12-31' });
});

test('il confronto usa lo stesso tratto del periodo precedente', () => {
  assert.deepEqual(comparisonRange({ preset: 'month', from: '2026-10-01', to: today }), { from: '2026-09-01', to: '2026-09-29' });
  assert.deepEqual(comparisonRange({ preset: 'ytd', from: '2026-01-01', to: today }), { from: '2025-01-01', to: '2025-10-29' });
  assert.equal(comparisonRange({ preset: 'all', from: '2024-01-02', to: today }), null);
});

test('un periodo libero si sposta della sua durata', () => {
  assert.deepEqual(shiftRange({ from: '2026-10-10', to: '2026-10-19' }, -1), { from: '2026-09-30', to: '2026-10-09' });
});

test('un mese chiuso resta chiuso quando si sposta', () => {
  assert.deepEqual(shiftRange({ from: '2026-02-01', to: '2026-02-28' }, 1), { from: '2026-03-01', to: '2026-03-31' });
});

test('la granularità automatica segue la durata e non supera il limite di barre', () => {
  assert.equal(resolveGranularity('auto', { from: '2026-10-01', to: today }), 'day');
  assert.equal(resolveGranularity('auto', { from: '2026-08-01', to: today }), 'week');
  assert.equal(resolveGranularity('auto', { from: '2025-11-01', to: today }), 'month');
  assert.equal(resolveGranularity('day', { from: '2024-01-01', to: today }), 'month');
  assert.equal(resolveGranularity('day', { from: '2026-01-01', to: today }), 'week');
});

test('gli intervalli coprono il periodo senza buchi', () => {
  const buckets = enumerateBuckets({ from: '2026-10-15', to: '2026-12-10' }, 'month');
  assert.deepEqual(buckets.map((b) => [b.from, b.to]), [
    ['2026-10-15', '2026-10-31'],
    ['2026-11-01', '2026-11-30'],
    ['2026-12-01', '2026-12-10'],
  ]);
});
