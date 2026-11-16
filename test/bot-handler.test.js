import test from 'node:test';
import assert from 'node:assert/strict';
import { confirmation, handleUpdate } from '../bot/src/handler.js';
import {
  generateInboxKeys, importInboxPrivateKey, importInboxPublicKey, openInboxItem,
} from '../public/js/vault/inbox-crypto.js';

const hints = { v: 1, accounts: ['Satispay', 'Conto'], defaultAccount: 'Satispay', categories: { expense: ['Ristoranti'], income: ['Stipendio'] }, tags: [] };
const ok = (fields = {}) => ({ status: 'ok', kind: 'expense', amount: 18.5, date: '2026-11-15', account: 'Satispay', toAccount: null, category: 'Ristoranti', tag: null, comment: 'Pizza', question: null, ...fields });
const CHAT = 4242;
// Intl puts a non-breaking space before €.
const plain = (text) => text.replace(/\u00a0/g, ' ');

async function setup({ parsed = ok(), storedHints = hints, allowedChatId = CHAT } = {}) {
  const { publicJwk, privateJwk } = await generateInboxKeys();
  const sent = [];
  const edits = [];
  const answers = [];
  const inbox = new Map();
  const parses = [];
  const deps = {
    telegram: {
      sendMessage: async (chatId, text, extra) => sent.push({ chatId, text, extra }),
      editMessageText: async (chatId, messageId, text) => edits.push({ chatId, messageId, text }),
      answerCallbackQuery: async (id, text) => answers.push({ id, text }),
    },
    firestore: {
      readHints: async () => storedHints,
      createInboxItem: async (id, item) => {
        if (inbox.has(id)) return false;
        inbox.set(id, item);
        return true;
      },
    },
    parse: async (text) => {
      parses.push(text);
      return typeof parsed === 'function' ? parsed(text) : parsed;
    },
    publicKey: await importInboxPublicKey(publicJwk),
    allowedChatId,
    model: 'claude-haiku-5-5',
    now: () => new Date('2026-11-16T10:00:00Z'),
  };
  const privateKey = await importInboxPrivateKey(privateJwk);
  const open = (id) => openInboxItem(privateKey, id, inbox.get(id));
  return { deps, sent, edits, answers, inbox, parses, open };
}

const message = (text, extra = {}) => ({ update_id: 1001, message: { message_id: 5, date: 1794830400, chat: { id: CHAT }, text, ...extra } });

test('a message becomes a sealed inbox item and a confirmation with Annulla', async () => {
  const t = await setup();
  await handleUpdate(message('pizza 18,50 ieri'), t.deps);
  const item = await t.open('1001');
  assert.equal(item.text, 'pizza 18,50 ieri');
  assert.deepEqual(item.parsed, ok());
  assert.equal(item.model, 'claude-haiku-5-5');
  const [reply] = t.sent;
  assert.equal(plain(reply.text), '✓ 18,50 € · Ristoranti · Satispay · ieri\nPizza');
  assert.deepEqual(reply.extra.reply_markup.inline_keyboard[0][0], { text: 'Annulla', callback_data: 'x:1001' });
});

test('the same update delivered twice is saved and answered once', async () => {
  const t = await setup();
  await handleUpdate(message('pizza 18,50'), t.deps);
  await handleUpdate(message('pizza 18,50'), t.deps);
  assert.equal(t.inbox.size, 1);
  assert.equal(t.sent.length, 1);
});

test('other chats are ignored, and before setup the bot only tells the chat id', async () => {
  const stranger = await setup();
  await handleUpdate({ update_id: 1, message: { chat: { id: 999 }, text: 'pizza 10' } }, stranger.deps);
  assert.equal(stranger.sent.length, 0);
  assert.equal(stranger.parses.length, 0);

  const fresh = await setup({ allowedChatId: null });
  await handleUpdate(message('ciao'), fresh.deps);
  assert.match(fresh.sent[0].text, /chat id è 4242/);
  assert.equal(fresh.inbox.size, 0);
});

test('a missing amount is asked with a reply that carries the original message', async () => {
  const t = await setup({ parsed: (text) => (text.includes('30') ? ok({ amount: 30, comment: 'Regalo' }) : { ...ok({ amount: null }), status: 'needs_info', question: 'Quanto hai speso?' }) });
  await handleUpdate(message('regalo per mamma'), t.deps);
  assert.equal(t.inbox.size, 0);
  const question = t.sent[0];
  assert.equal(question.text, '«regalo per mamma»\nQuanto hai speso?');
  assert.equal(question.extra.reply_markup.force_reply, true);

  await handleUpdate({ update_id: 1002, message: { message_id: 7, chat: { id: CHAT }, text: '30', reply_to_message: { from: { is_bot: true }, text: question.text } } }, t.deps);
  assert.equal(t.parses[1], 'regalo per mamma\n30');
  assert.equal((await t.open('1002')).text, 'regalo per mamma\n30');
});

test('fields the app would refuse are still saved, to complete in the app', async () => {
  const t = await setup({ parsed: ok({ category: null }) });
  await handleUpdate(message('cose 12'), t.deps);
  assert.equal(t.inbox.size, 1);
  assert.match(t.sent[0].text, /^Salvato, ma da completare nell’app: scegli una categoria\./);
});

test('without hints, nothing is parsed and the app is pointed to', async () => {
  const t = await setup({ storedHints: null });
  await handleUpdate(message('pizza 10'), t.deps);
  assert.equal(t.parses.length, 0);
  assert.match(t.sent[0].text, /apri l’app/);
});

test('help, non-text messages and failures get an answer, not silence', async () => {
  const t = await setup({ parsed: null });
  await handleUpdate(message('/aiuto'), t.deps);
  await handleUpdate(message(undefined, { photo: [{}] }), t.deps);
  await handleUpdate(message('boh'), t.deps);
  assert.match(t.sent[0].text, /pizza 18,50/);
  assert.match(t.sent[1].text, /messaggio di testo/);
  assert.equal(t.sent[2].text, 'Non ho capito, puoi riscriverlo?');

  const broken = await setup();
  broken.deps.firestore.createInboxItem = async () => { throw new Error('PERMISSION_DENIED'); };
  const errors = [];
  const original = console.error;
  console.error = (error) => errors.push(error);
  await handleUpdate(message('pizza 10'), broken.deps);
  console.error = original;
  assert.match(broken.sent[0].text, /non l’ho salvato/);
  assert.equal(errors.length, 1);
});

test('Annulla sends a cancel item for the app and marks the message', async () => {
  const t = await setup();
  const query = { id: 'q1', data: 'x:1001', message: { message_id: 9, chat: { id: CHAT }, text: '✓ 18,50 € · Ristoranti' } };
  await handleUpdate({ update_id: 2000, callback_query: query }, t.deps);
  assert.deepEqual(await t.open('x-1001'), { v: 1, type: 'cancel', ref: '1001' });
  assert.equal(t.edits[0].text, '✓ 18,50 € · Ristoranti\n\n✗ Annullato');
  assert.deepEqual(t.answers, [{ id: 'q1', text: 'Annullato' }]);

  const other = await setup();
  await handleUpdate({ update_id: 2001, callback_query: { ...query, message: { ...query.message, chat: { id: 1 } } } }, other.deps);
  assert.equal(other.inbox.size, 0);
});

test('confirmations read naturally for income and transfers', () => {
  assert.equal(plain(confirmation(ok({ kind: 'income', amount: 1800, category: 'Stipendio', account: 'Conto', comment: null, date: '2026-11-16' }), '2026-11-16')),
    '＋ 1.800,00 € · Stipendio · Conto · oggi');
  assert.equal(plain(confirmation(ok({ kind: 'transfer', amount: 50, account: 'Conto', toAccount: 'Satispay', category: null, comment: null, date: '2026-11-02' }), '2026-11-16')),
    '✓ 50,00 € · Giroconto · Conto → Satispay · 2 nov 2026');
});
