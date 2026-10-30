import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveAuthPassword, deriveVaultKey, openJson, randomBytes, sealJson } from '../public/js/vault/crypto.js';
import { createRepository } from '../public/js/data/repository.js';

// Fewer iterations, only to keep the tests fast.
const FAST = 1000;

test('the Firebase password is deterministic and differs from the code', async () => {
  const a = await deriveAuthPassword('codice segreto lungo', 'Me@Example.com', FAST);
  const b = await deriveAuthPassword('codice segreto lungo', 'me@example.com ', FAST);
  assert.equal(a, b);
  assert.notEqual(a, 'codice segreto lungo');
  assert.notEqual(a, await deriveAuthPassword('altro codice', 'me@example.com', FAST));
});

test('encrypted data reopens only with the same key and the same container', async () => {
  const salt = randomBytes(16);
  const key = await deriveVaultKey('codice segreto lungo', salt, FAST);
  const sealed = await sealJson(key, { spese: [1, 2, 3] }, 'dataset');
  assert.doesNotMatch(sealed.data, /spese/);
  assert.deepEqual(await openJson(key, sealed, 'dataset'), { spese: [1, 2, 3] });

  const wrongKey = await deriveVaultKey('codice sbagliato', salt, FAST);
  await assert.rejects(() => openJson(wrongKey, sealed, 'dataset'), /decifrare/);
  await assert.rejects(() => openJson(key, sealed, 'categorization'), /decifrare/);
});

function memoryStorage() {
  const blobs = new Map();
  return { blobs, read: async (name) => structuredClone(blobs.get(name) ?? null), write: async (name, value) => { blobs.set(name, structuredClone(value)); } };
}

test('the repository saves rules and overrides and rejects invalid input', async () => {
  const storage = memoryStorage();
  const repo = createRepository(storage);
  assert.equal(await repo.dataset(), null);

  let config = await repo.addRule({ kind: 'expense', field: 'comment', operator: 'contains', value: 'Dropbox', category: 'Abbonamenti' });
  const [rule] = config.rules;
  config = await repo.setOverride('tx1', 'Svago');
  await repo.addRule({ kind: 'expense', field: 'tag', operator: 'equals', value: 'Gas', category: 'Utility' });
  config = await repo.moveRule(rule.id, 'down');
  assert.equal(config.rules[1].id, rule.id);
  assert.deepEqual(storage.blobs.get('categorization').overrides, { tx1: 'Svago' });

  await assert.rejects(() => repo.addRule({ kind: 'expense', field: 'comment', operator: 'contains', value: '', category: 'X' }), /testo/);
  await assert.rejects(() => repo.deleteRule('inesistente'), /non trovata/);
  assert.equal(storage.blobs.get('categorization').rules.length, 2);
});
