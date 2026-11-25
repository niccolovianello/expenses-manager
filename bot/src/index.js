// Cloudflare Worker: Telegram's webhook for the expense bot (see TELEGRAM-BOT.md).
// Answers Telegram at once and does the work afterwards, replying with sendMessage.
import Anthropic from '@anthropic-ai/sdk';
import { importInboxPublicKey } from '../../public/js/vault/inbox-crypto.js';
import { createFirestoreClient } from './firestore.js';
import { createTelegram } from './telegram.js';
import { parseTransactions } from './parse.js';
import { handleUpdate } from './handler.js';

// Built once per isolate and reused: the Firebase token and the imported key survive between requests.
let cached = null;

async function depsFor(env) {
  if (cached) return cached;
  // A key created outside any workspace must name one on every request (ANTHROPIC_WORKSPACE_ID);
  // a key created inside a workspace needs nothing more.
  const client = new Anthropic({
    apiKey: env.ANTHROPIC_API_KEY,
    ...(env.ANTHROPIC_WORKSPACE_ID ? { defaultHeaders: { 'anthropic-workspace-id': env.ANTHROPIC_WORKSPACE_ID } } : {}),
  });
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
    parse: (text, hints, now) => parseTransactions({ client, model, hints, text, now }),
    allowedChatId: env.ALLOWED_CHAT_ID || null,
    model,
    now: () => new Date(),
  };
  return cached;
}

const encoder = new TextEncoder();

function sameSecret(value, secret) {
  const given = encoder.encode(value ?? '');
  const expected = encoder.encode(secret ?? '');
  return expected.length > 0 && given.length === expected.length && crypto.subtle.timingSafeEqual(given, expected);
}

// Telegram sends the secret chosen with setWebhook in this header: anything else is not Telegram.
const fromTelegram = (request, secret) => sameSecret(request.headers.get('X-Telegram-Bot-Api-Secret-Token'), secret);

// POST /setup, with the webhook secret in X-Setup-Secret: the Worker registers itself with Telegram,
// from Cloudflare's network and with the token it already holds. Used by scripts/set-webhook.js, so the
// token never has to leave the Worker (some networks stall requests that carry it).
async function setUp(request, env) {
  if (!sameSecret(request.headers.get('X-Setup-Secret'), env.TELEGRAM_WEBHOOK_SECRET)) return new Response('Forbidden', { status: 403 });
  const telegram = createTelegram(env.TELEGRAM_TOKEN);
  const url = new URL(request.url).origin;
  try {
    await telegram.call('setWebhook', { url, secret_token: env.TELEGRAM_WEBHOOK_SECRET, allowed_updates: ['message', 'callback_query'], drop_pending_updates: true });
    await telegram.call('setMyCommands', { commands: [{ command: 'aiuto', description: 'Come scrivere una spesa' }] });
    const [me, info] = await Promise.all([telegram.call('getMe', {}), telegram.call('getWebhookInfo', {})]);
    return Response.json({ ok: true, bot: me.username, url: info.url, pending: info.pending_update_count, lastError: info.last_error_message ?? null });
  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 502 });
  }
}

export default {
  async fetch(request, env, ctx) {
    if (request.method !== 'POST') return new Response('Spese bot', { status: 200 });
    if (new URL(request.url).pathname === '/setup') return setUp(request, env);
    if (!fromTelegram(request, env.TELEGRAM_WEBHOOK_SECRET)) return new Response('Forbidden', { status: 403 });
    const update = await request.json().catch(() => null);
    if (!update) return new Response('Bad request', { status: 400 });
    ctx.waitUntil(depsFor(env).then((deps) => handleUpdate(update, deps)).catch((error) => console.error(error)));
    return new Response('ok');
  },
};
