import test from 'node:test';
import assert from 'node:assert/strict';
import {
  generateInboxKeys, importInboxPrivateKey, importInboxPublicKey, MAX_INBOX_DATA, openInboxItem, sealInboxItem,
} from '../public/js/vault/inbox-crypto.js';

const payload = {
  v: 1,
  receivedAt: '2026-11-16T09:30:00Z',
  text: 'pizza 18,50 ieri satispay',
  parsed: { kind: 'expense', date: '2026-11-15', amount: 18.5, account: 'Satispay', category: 'Ristoranti' },
};

async function keys() {
  const { privateJwk, publicJwk } = await generateInboxKeys();
  return { publicJwk, privateJwk, publicKey: await importInboxPublicKey(publicJwk), privateKey: await importInboxPrivateKey(privateJwk) };
}

test('an item sealed with the public key opens with the private key', async () => {
  const { publicKey, privateKey } = await keys();
  const item = await sealInboxItem(publicKey, '123456', payload);
  assert.deepEqual(Object.keys(item).sort(), ['data', 'epk', 'iv', 'v']);
  assert.doesNotMatch(item.data, /pizza|Satispay/);
  assert.deepEqual(await openInboxItem(privateKey, '123456', item), payload);
});

test('every item gets its own ephemeral key and iv', async () => {
  const { publicKey } = await keys();
  const a = await sealInboxItem(publicKey, '1', payload);
  const b = await sealInboxItem(publicKey, '1', payload);
  assert.notEqual(a.epk, b.epk);
  assert.notEqual(a.data, b.data);
});

test('an item does not open under another document id, another key, or when tampered with', async () => {
  const { publicKey, privateKey } = await keys();
  const item = await sealInboxItem(publicKey, '123456', payload);
  await assert.rejects(() => openInboxItem(privateKey, '123457', item), /Impossibile leggere/);

  const other = await keys();
  await assert.rejects(() => openInboxItem(other.privateKey, '123456', item), /Impossibile leggere/);

  const flipped = item.data[5] === 'A' ? 'B' : 'A';
  const tampered = { ...item, data: item.data.slice(0, 5) + flipped + item.data.slice(6) };
  await assert.rejects(() => openInboxItem(privateKey, '123456', tampered), /Impossibile leggere/);

  const otherEpk = (await sealInboxItem(publicKey, '123456', payload)).epk;
  await assert.rejects(() => openInboxItem(privateKey, '123456', { ...item, epk: otherEpk }), /Impossibile leggere/);
  await assert.rejects(() => openInboxItem(privateKey, '123456', { ...item, epk: 'not-a-key' }), /Impossibile leggere/);
});

test('unknown versions and missing document ids are refused', async () => {
  const { publicKey, privateKey } = await keys();
  const item = await sealInboxItem(publicKey, '1', payload);
  await assert.rejects(() => openInboxItem(privateKey, '1', { ...item, v: 2 }), /formato non supportato/);
  await assert.rejects(() => sealInboxItem(publicKey, '', payload), /document id/);
  await assert.rejects(() => openInboxItem(privateKey, undefined, item), /document id/);
});

test('the bot side refuses the private key and the app side the public one', async () => {
  const { publicJwk, privateJwk } = await keys();
  assert.equal('d' in publicJwk, false);
  await assert.rejects(() => importInboxPublicKey(privateJwk), /private inbox key/);
  await assert.rejects(() => importInboxPrivateKey(publicJwk), /public inbox key/);
  await assert.rejects(() => importInboxPublicKey({ kty: 'RSA' }), /P-256/);
});

test('oversized items are refused before they reach Firestore', async () => {
  const { publicKey } = await keys();
  await assert.rejects(() => sealInboxItem(publicKey, '1', { text: 'x'.repeat(MAX_INBOX_DATA) }), /too large/);
});

test('the keys survive a JSON round trip, as when stored in a blob or a Worker secret', async () => {
  const { publicJwk, privateJwk } = await generateInboxKeys();
  const publicKey = await importInboxPublicKey(JSON.parse(JSON.stringify(publicJwk)));
  const privateKey = await importInboxPrivateKey(JSON.parse(JSON.stringify(privateJwk)));
  const item = await sealInboxItem(publicKey, 'abc', payload);
  assert.deepEqual(await openInboxItem(privateKey, 'abc', item), payload);
});
