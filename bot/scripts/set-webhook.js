#!/usr/bin/env node
// Asks the deployed Worker to register itself as the bot's webhook (POST /setup). The Worker calls
// Telegram from Cloudflare with the token it already holds, so the token is not needed here: only the
// webhook secret, which proves the request is yours.
// Usage (from bot/): npm run set-webhook -- https://expense-manager.<your-subdomain>.workers.dev
// Reads TELEGRAM_WEBHOOK_SECRET from .dev.vars (the same value stored in the Worker).
const url = process.argv[2]?.replace(/\/+$/, '');
const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
if (!url?.startsWith('https://') || !secret) {
  console.error('Usage: npm run set-webhook -- https://<worker url>   (TELEGRAM_WEBHOOK_SECRET in .dev.vars)');
  process.exit(1);
}

const response = await fetch(`${url}/setup`, { method: 'POST', headers: { 'X-Setup-Secret': secret }, signal: AbortSignal.timeout(30_000) });
if (response.status === 403) {
  console.error('The Worker refused: TELEGRAM_WEBHOOK_SECRET in .dev.vars differs from the one stored with wrangler secret put.');
  process.exit(1);
}
const result = await response.json().catch(() => null);
if (!result?.ok) {
  console.error(`Setup failed: ${result?.error ?? `HTTP ${response.status}`}`);
  process.exit(1);
}
console.log(`Webhook set for @${result.bot}.`);
console.log({ url: result.url, pending: result.pending, lastError: result.lastError });
