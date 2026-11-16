#!/usr/bin/env node
// Puts one item in the Telegram inbox exactly as the bot will, to try the app side without Telegram
// or Claude. Needs the bot's Firebase user and rules from TELEGRAM-BOT.md (section 2).
//
// Usage:
//   node --env-file=bot/.dev.vars scripts/fake-inbox-item.js 'pizza 18,50 ieri' '{"kind":"expense","amount":18.5,"account":"Satispay","category":"Ristoranti"}'
//   node --env-file=bot/.dev.vars scripts/fake-inbox-item.js --cancel <docId>
//
// bot/.dev.vars (git-ignored) holds FIREBASE_API_KEY, FIREBASE_PROJECT_ID, BOT_EMAIL, BOT_PASSWORD,
// OWNER_UID and INBOX_PUBLIC_KEY, the same names the Worker uses.
import { importInboxPublicKey, sealInboxItem } from '../public/js/vault/inbox-crypto.js';
import { createFirestoreClient } from '../bot/src/firestore.js';

const REQUIRED = ['FIREBASE_API_KEY', 'FIREBASE_PROJECT_ID', 'BOT_EMAIL', 'BOT_PASSWORD', 'OWNER_UID', 'INBOX_PUBLIC_KEY'];
const missing = REQUIRED.filter((name) => !process.env[name]);
if (missing.length) {
  console.error(`Missing: ${missing.join(', ')} (pass them with --env-file=bot/.dev.vars)`);
  process.exit(1);
}

const [first, second] = process.argv.slice(2);
if (!first) {
  console.error("Usage: scripts/fake-inbox-item.js '<message>' '<parsed JSON>'  |  --cancel <docId>");
  process.exit(1);
}

const today = new Date().toISOString().slice(0, 10);
const payload = first === '--cancel'
  ? { v: 1, type: 'cancel', ref: second }
  : {
      v: 1,
      receivedAt: new Date().toISOString(),
      text: first,
      parsed: { status: 'ok', kind: 'expense', date: today, tag: null, comment: null, ...JSON.parse(second ?? '{}') },
      model: 'fake',
    };

// Telegram update ids are numbers; a fake one from the clock does not collide with them in practice.
const docId = `fake-${Date.now()}`;
const publicKey = await importInboxPublicKey(JSON.parse(process.env.INBOX_PUBLIC_KEY));
const firestore = createFirestoreClient({
  apiKey: process.env.FIREBASE_API_KEY,
  projectId: process.env.FIREBASE_PROJECT_ID,
  email: process.env.BOT_EMAIL,
  password: process.env.BOT_PASSWORD,
  ownerUid: process.env.OWNER_UID,
});
await firestore.createInboxItem(docId, await sealInboxItem(publicKey, docId, payload));
console.log(`Inbox item ${docId} written: unlock the app (or reload it) to see it.`);
