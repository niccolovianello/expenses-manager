import test from 'node:test';
import assert from 'node:assert/strict';
import { createRepository, inboxEntryId } from '../public/js/data/repository.js';
import { generateInboxKeys, importInboxPublicKey, sealInboxItem } from '../public/js/vault/inbox-crypto.js';

// Blobs and inbox in memory, as createVaultStorage exposes them on Firebase.
function memoryStorage() {
  const blobs = new Map();
  const inbox = new Map();
  return {
    uid: 'owner-uid',
    blobs,
    inboxItems: inbox,
    read: async (name) => structuredClone(blobs.get(name) ?? null),
    write: async (name, value) => { blobs.set(name, structuredClone(value)); },
    inbox: {
      list: async () => [...inbox].map(([id, data]) => ({ id, ...structuredClone(data) })),
      remove: async (id) => { inbox.delete(id); },
    },
  };
}

const parsed = (patch = {}) => ({ status: 'ok', kind: 'expense', date: '2026-11-15', amount: 18.5, account: 'Satispay', category: 'Ristoranti', tag: null, comment: 'Pizza', ...patch });

async function setup() {
  const storage = memoryStorage();
  const repo = createRepository(storage);
  await repo.addAccount({ name: 'Satispay', balance: 50 });
  await repo.addAccount({ name: 'Conto', balance: 1000 });
  const setupInfo = await repo.createInboxKey();
  const publicKey = await importInboxPublicKey(setupInfo.publicJwk);
  // What the bot does: seal with the public key and create the document.
  const send = async (docId, payload) => storage.inboxItems.set(docId, await sealInboxItem(publicKey, docId, payload));
  const message = (docId, patch, text = 'pizza 18,50 ieri') => send(docId, { v: 1, receivedAt: '2026-11-16T09:00:00Z', text, parsed: parsed(patch) });
  return { storage, repo, setupInfo, send, message };
}

test('the inbox key is stored as a vault blob, and only its public half is handed out', async () => {
  const { storage, repo, setupInfo } = await setup();
  assert.equal(setupInfo.ownerUid, 'owner-uid');
  assert.equal('d' in setupInfo.publicJwk, false);
  assert.ok(storage.blobs.get('inbox-key').privateJwk.d);
  assert.deepEqual(await repo.inboxSetup(), setupInfo);
  assert.equal(await createRepository(memoryStorage()).inboxSetup(), null);
});

test('without a key or an inbox, draining does nothing', async () => {
  const empty = await createRepository(memoryStorage()).drainInbox();
  assert.deepEqual(empty, { entries: null, added: 0, cancelled: 0, review: [], unreadable: [] });
  const { inbox, ...noInbox } = memoryStorage();
  assert.equal((await createRepository(noInbox).drainInbox()).added, 0);
});

test('valid items become manual transactions and leave the inbox', async () => {
  const { storage, repo, message } = await setup();
  await message('101');
  await message('102', { amount: '4,20', category: 'Bar', comment: null });
  const result = await repo.drainInbox();
  assert.equal(result.added, 2);
  assert.equal(storage.inboxItems.size, 0);
  const added = result.entries.filter((entry) => entry.via === 'telegram');
  assert.deepEqual(added.map((entry) => [entry.id, entry.amount, entry.sourceCategory]), [
    [inboxEntryId('101'), 18.5, 'Ristoranti'],
    [inboxEntryId('102'), 4.2, 'Bar'],
  ]);
  assert.equal(added[0].origin, 'manual');
  assert.deepEqual(await repo.entries(), result.entries);
});

test('invalid or incomplete items wait for review, with the reason', async () => {
  const { storage, repo, message } = await setup();
  await message('201', { account: 'Carta che non esiste' });
  await message('202', { category: null });
  await message('203', { status: 'needs_info', amount: null, question: 'Quanto hai speso?' }, 'pizza ieri');
  const result = await repo.drainInbox();
  assert.equal(result.added, 0);
  assert.equal(result.entries, null);
  assert.deepEqual(result.review.map((item) => [item.id, item.error]), [
    ['201', 'Scegli un conto dall’elenco dei conti'],
    ['202', 'Scegli una categoria'],
    ['203', 'Quanto hai speso?'],
  ]);
  assert.equal(result.review[2].text, 'pizza ieri');
  assert.equal(storage.inboxItems.size, 3);
});

test('a reviewed item is saved with the corrected values, once', async () => {
  const { storage, repo, message } = await setup();
  await message('301', { account: 'Carta che non esiste' });
  const [item] = (await repo.drainInbox()).review;
  const input = { ...item.parsed, account: 'Conto' };
  let entries = await repo.acceptInboxItem(item.id, input);
  entries = await repo.acceptInboxItem(item.id, input);
  assert.deepEqual(entries.filter((entry) => entry.id === inboxEntryId('301')).map((entry) => entry.account), ['Conto']);
  assert.equal(storage.inboxItems.size, 0);
  await assert.rejects(() => repo.acceptInboxItem('302', { ...input, amount: 0 }), /importo/);
});

test('discarding an item only removes it from the inbox', async () => {
  const { storage, repo, message } = await setup();
  await message('401', { category: null });
  await repo.discardInboxItem('401');
  assert.equal(storage.inboxItems.size, 0);
  assert.equal((await repo.entries()).length, 0);
});

test('an item already added is not added again when its deletion failed', async () => {
  const { storage, repo, message } = await setup();
  await message('501');
  const original = storage.inbox.remove;
  storage.inbox.remove = async () => { throw new Error('offline'); };
  await assert.rejects(() => repo.drainInbox(), /offline/);
  storage.inbox.remove = original;
  const result = await repo.drainInbox();
  assert.equal(result.added, 0);
  assert.equal(storage.inboxItems.size, 0);
  assert.equal((await repo.entries()).length, 1);
});

test('a cancel takes back an item still waiting, or a transaction already added', async () => {
  const { storage, repo, message, send } = await setup();
  await message('601');
  await repo.drainInbox();
  await message('602');
  await send('603', { v: 1, type: 'cancel', ref: '601' });
  await send('604', { v: 1, type: 'cancel', ref: '602' });
  await send('605', { v: 1, type: 'cancel', ref: 'gone' });
  const result = await repo.drainInbox();
  assert.equal(result.cancelled, 2);
  assert.equal(result.added, 0);
  assert.deepEqual(result.entries, []);
  assert.equal(storage.inboxItems.size, 0);
});

test('items sealed with another key are reported, not dropped', async () => {
  const { storage, repo, message } = await setup();
  const stranger = await importInboxPublicKey((await generateInboxKeys()).publicJwk);
  storage.inboxItems.set('701', await sealInboxItem(stranger, '701', { v: 1, parsed: parsed() }));
  await message('702');
  const result = await repo.drainInbox();
  assert.equal(result.added, 1);
  assert.deepEqual(result.unreadable.map((item) => item.id), ['701']);
  assert.deepEqual([...storage.inboxItems.keys()], ['701']);
});

test('a new key makes the old items unreadable', async () => {
  const { repo, message } = await setup();
  await message('801');
  const next = await repo.createInboxKey();
  assert.notDeepEqual(next.publicJwk, (await setup()).setupInfo.publicJwk);
  assert.deepEqual((await repo.drainInbox()).unreadable.map((item) => item.id), ['801']);
});
