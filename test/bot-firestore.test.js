import test from 'node:test';
import assert from 'node:assert/strict';
import { createFirestoreClient } from '../bot/src/firestore.js';

const config = { apiKey: 'api-key', projectId: 'demo', email: 'bot@example.invalid', password: 'pw', ownerUid: 'owner' };
const sealed = { v: 1, epk: 'EPK', iv: 'IV', data: 'DATA' };

// Answers sign-in, then the commit with `commit` (a status and a body).
function fakeFetch(commit = { status: 200, body: {} }) {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url, init, body: init?.body ? JSON.parse(init.body) : null });
    if (url.includes('signInWithPassword')) return Response.json({ idToken: 'token-1', expiresIn: '3600' });
    return Response.json(commit.body, { status: commit.status });
  };
  return { calls, fetch };
}

test('an inbox item is created once, at the server time, as the bot', async (t) => {
  const fake = fakeFetch();
  t.mock.method(globalThis, 'fetch', fake.fetch);
  const client = createFirestoreClient(config);
  assert.equal(await client.createInboxItem('42', sealed), true);
  assert.equal(await client.createInboxItem('43', sealed), true);

  const signIns = fake.calls.filter((call) => call.url.includes('signInWithPassword'));
  assert.equal(signIns.length, 1, 'the token is reused');
  assert.deepEqual(signIns[0].body, { email: 'bot@example.invalid', password: 'pw', returnSecureToken: true });

  const [write] = fake.calls[1].body.writes;
  assert.equal(fake.calls[1].init.headers.Authorization, 'Bearer token-1');
  assert.equal(write.update.name, 'projects/demo/databases/(default)/documents/users/owner/inbox/42');
  assert.deepEqual(Object.keys(write.update.fields).sort(), ['data', 'epk', 'iv', 'v']);
  assert.deepEqual(write.updateTransforms, [{ fieldPath: 'createdAt', setToServerValue: 'REQUEST_TIME' }]);
  assert.deepEqual(write.currentDocument, { exists: false });
});

test('a Telegram update delivered twice is not an error', async (t) => {
  const fake = fakeFetch({ status: 409, body: { error: { status: 'ALREADY_EXISTS', message: 'Document already exists' } } });
  t.mock.method(globalThis, 'fetch', fake.fetch);
  assert.equal(await createFirestoreClient(config).createInboxItem('42', sealed), false);
});

test('a refusal from the rules is reported', async (t) => {
  const fake = fakeFetch({ status: 403, body: { error: { status: 'PERMISSION_DENIED', message: 'Missing or insufficient permissions.' } } });
  t.mock.method(globalThis, 'fetch', fake.fetch);
  await assert.rejects(() => createFirestoreClient(config).createInboxItem('42', sealed), /Inbox write: Missing or insufficient permissions/);
});
