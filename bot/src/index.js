// Cloudflare Worker: Telegram's webhook for the expense bot (see TELEGRAM-BOT.md).
// Answers Telegram at once and does the work afterwards, replying with sendMessage.
import Anthropic from '@anthropic-ai/sdk';
import { importInboxPublicKey } from '../../public/js/vault/inbox-crypto.js';
import { createFirestoreClient } from './firestore.js';
import { createTelegram } from './telegram.js';
import { parseExpense } from './parse.js';
import { handleUpdate } from './handler.js';

// Built once per isolate and reused: the Firebase token and the imported key survive between requests.
let cached = null;

async function depsFor(env) {
  if (cached) return cached;
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  const model = env.MODEL || 'claude-haiku-5-5';
  cached = {
    telegram: createTelegram(env.TELEGRAM_TOKEN),
    firestore: createFirestoreClient({
      apiKey: env.FIREBASE_API_KEY,
      projectId: env.FIREBASE_PROJECT_ID,
      email: env.BOT_EMAIL,
      password: env.BOT_PASSWORD,
      ownerUid: env.OWNER_UID,
    }),
    publicKey: await importInboxPublicKey(JSON.parse(env.INBOX_PUBLIC_KEY)),
    parse: (text, hints, now) => parseExpense({ client, model, hints, text, now }),
    allowedChatId: env.ALLOWED_CHAT_ID || null,
    model,
    now: () => new Date(),
  };
  return cached;
}

const encoder = new TextEncoder();

// Telegram sends the secret chosen with setWebhook in this header: anything else is not Telegram.
function fromTelegram(request, secret) {
  const given = encoder.encode(request.headers.get('X-Telegram-Bot-Api-Secret-Token') ?? '');
  const expected = encoder.encode(secret ?? '');
  return expected.length > 0 && given.length === expected.length && crypto.subtle.timingSafeEqual(given, expected);
}

export default {
  async fetch(request, env, ctx) {
    if (request.method !== 'POST') return new Response('Spese bot', { status: 200 });
    if (!fromTelegram(request, env.TELEGRAM_WEBHOOK_SECRET)) return new Response('Forbidden', { status: 403 });
    const update = await request.json().catch(() => null);
    if (!update) return new Response('Bad request', { status: 400 });
    ctx.waitUntil(depsFor(env).then((deps) => handleUpdate(update, deps)).catch((error) => console.error(error)));
    return new Response('ok');
  },
};
