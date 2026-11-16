#!/usr/bin/env node
// Points Telegram at the deployed Worker, with the secret it will send in every request.
// Usage (from bot/): npm run set-webhook -- https://spese-telegram-bot.<your-subdomain>.workers.dev
// Reads TELEGRAM_TOKEN and TELEGRAM_WEBHOOK_SECRET from .dev.vars.
const url = process.argv[2];
const { TELEGRAM_TOKEN: token, TELEGRAM_WEBHOOK_SECRET: secret } = process.env;
if (!url?.startsWith('https://') || !token || !secret) {
  console.error('Usage: npm run set-webhook -- https://<worker url>   (TELEGRAM_TOKEN and TELEGRAM_WEBHOOK_SECRET in .dev.vars)');
  process.exit(1);
}

const call = async (method, body) => {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });
  return response.json();
};

const set = await call('setWebhook', { url, secret_token: secret, allowed_updates: ['message', 'callback_query'], drop_pending_updates: true });
console.log(set.ok ? 'Webhook set.' : `setWebhook failed: ${set.description}`);
await call('setMyCommands', { commands: [{ command: 'aiuto', description: 'Come scrivere una spesa' }] });
const info = await call('getWebhookInfo');
console.log({ url: info.result?.url, pending: info.result?.pending_update_count, lastError: info.result?.last_error_message ?? null });
