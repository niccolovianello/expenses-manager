# Plan: adding expenses from Telegram

Status: steps 1–4 built (inbox crypto; app side; Firestore rules; the Worker in `bot/`). Setting it up is by hand, in DEPLOY.md (*Telegram bot*). Left: nothing required; see *Later* at the end.

Goal: send a message like *"pizza 18,50 ieri satispay"* to a private Telegram bot. Claude turns it into a transaction, and the transaction shows up in **Movimenti** the next time the app is unlocked. Your existing data stays readable only by the browser.

## Why an inbox

Everything on Firestore is encrypted with an AES key derived from the secret code (`public/js/vault/crypto.js`), and that key never leaves the browser. A server-side bot can't decrypt `entries`, so it can't append to it. Handing the bot the key would undo the whole security model.

Instead, the bot drops each new transaction into an **inbox** that it can only write to, using public-key encryption:

```
Telegram ──webhook──▶ Cloudflare Worker ──▶ Claude (extract fields)
                            │
                            ├─ seal JSON with the inbox PUBLIC key
                            └─ create users/{owner}/inbox/{updateId}  (create-only)

App unlock ──▶ read inbox ──▶ open with the inbox PRIVATE key (stored encrypted with the data key)
           ──▶ addEntry (same path as "Nuovo movimento") ──▶ delete inbox doc
```

What a compromised bot or Worker could do: read the account and category names (see *Hints* below), and push junk into the inbox. It could not read, change or delete any existing data.

## 1. Crypto (shared by the app and the Worker)

Web Crypto exists in browsers, Workers and Node 22, so one module works everywhere (`public/js/vault/inbox-crypto.js`, imported by the Worker too).

- **Key pair:** ECDH P-256, generated once in the app.
  - The private key (as a JWK) is saved in a new encrypted blob `inbox-key` through the existing `storage.write`, so it is sealed with the data key just like everything else.
  - The public key (as a JWK) is shown in the app so you can copy it into the Worker as a secret.
- **Sealing (Worker):**
  1. Generate an ephemeral ECDH key pair and derive a shared secret with ECDH.
  2. Run the secret through HKDF-SHA256 to get an AES-GCM-256 key.
  3. Encrypt the JSON. The additional authenticated data is `inbox:{docId}`, so an item can't be moved to another doc ID.
  4. Store `{ v: 1, epk, iv, data, createdAt }`.
- **Opening (app):** the reverse, using the private key.
- **Payload:** `{ v, receivedAt, text, parsed: { kind, date, amount, account, toAccount, category, tag, comment }, model }`. It keeps the original text so a review screen can show what you actually wrote.
- **Rotation:** "Rigenera chiave" replaces the key pair. Any inbox items sealed with the old key are shown as unreadable and can be discarded.

Test: `test/inbox.test.js` round-trips seal → open, rejects a doc-ID swap, and rejects a wrong key.

## 2. Firebase changes

1. **Bot identity.** In Authentication, add a second user, `bot@spese.niccolovianello.invalid`, with a long random password. Sign-ups stay disabled.
2. **Rules** (`firestore.rules`). The current `users/{uid}/{document=**}` rule already lets the owner do everything and gives the bot nothing. The new rules recognize the bot by its email (so no user id is written in this public repository) and let it:
   - `create` in `users/{uid}/inbox/{id}`, only for a user whose profile document exists, only with the fields `v`, `epk`, `iv`, `data`, `createdAt`, with `createdAt` equal to the server time and `data` at most 16,000 characters;
   - `read` `users/{uid}/bot/hints`.

   The bot can't read, update or delete inbox items. The owner keeps full access through the existing rule.
3. **API key.** The browser key only accepts requests from the site's referrers, so create a second API key for the Worker. Restrict it to the Identity Toolkit and Cloud Firestore APIs (a Worker has no referrer).

## 3. The Worker (`bot/`, its own package, deployed with `wrangler`)

`bot/` is outside `public/`, so it never reaches GitHub Pages.

- **`index.js`: webhook**
  - Reject the request unless the `X-Telegram-Bot-Api-Secret-Token` header matches.
  - Ignore messages from any chat except `ALLOWED_CHAT_ID`.
  - Answer `200` right away and do the work in `ctx.waitUntil`.
  - Reply to you with `sendMessage`.
- **Idempotency:** the inbox doc ID is the Telegram `update_id`. When Telegram retries a webhook, creating the same doc again returns `ALREADY_EXISTS`, which the Worker treats as already done.
- **`firestore.js`:** sign in with `accounts:signInWithPassword` (Identity Toolkit REST) and cache the ID token for about 55 minutes. Then create the doc with `POST …/documents/users/{owner}/inbox?documentId={update_id}` and read `bot/hints`.
- **`parse.js`: Claude call** with `@anthropic-ai/sdk` (it runs in Workers).
  - Model `claude-haiku-5-5` with `output_config.effort: "low"` (its default is `medium`). Messages are tiny, so cost per expense is negligible. The model ID is a Worker variable, so switching to `claude-opus-5-5` later is a one-line change.
  - Structured output via `output_config.format` with a JSON schema built from the hints:
    - `account` and `toAccount` are enums of your account names;
    - `category` is an enum of your categories;
    - `status` is `ok` or `needs_info`, with a `question` when information is missing.
  - The system prompt gives today's date (Europe/Rome), says that "ieri", "venerdì" and so on are relative to it, says that Italian amounts use a decimal comma, and names the default account to use when none is mentioned.
  - `stop_reason` is checked before the output is read. Haiku has no server-side refusal fallback, so on `refusal` or `max_tokens` the bot replies "Non ho capito, riscrivilo" and writes nothing.
  - Validation reuses `normalizeEntry` from `public/js/domain/entries.js`, so the bot and the app enforce the same rules.
- **Replies:**
  - Success: *"✓ 18,50 € · Ristoranti · Satispay · 15/11"*, with an **Annulla** button. The button writes a `{ type: 'cancel', ref }` inbox item.
  - `needs_info`: Claude's question, starting with your message in «», sent as a forced reply. Your answer arrives as a reply to it, so the Worker reads both together without keeping any state.
- **Commands:** `/aiuto` shows example messages. Cancelling is the **Annulla** button under each confirmation.
- **Secrets:** `TELEGRAM_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `ALLOWED_CHAT_ID`, `ANTHROPIC_API_KEY`, `FIREBASE_API_KEY`, `FIREBASE_PROJECT_ID`, `BOT_EMAIL`, `BOT_PASSWORD`, `OWNER_UID`, `INBOX_PUBLIC_KEY`.

## 4. App changes

- **`vault/firebase.js`:** also export `collection`, `getDocs` and `deleteDoc`.
- **`vault/inbox.js`:** `listInbox()` and `deleteInboxItem(id)` for `users/{uid}/inbox`.
- **`data/repository.js`:**
  - `inboxKey` load/create (the `inbox-key` blob).
  - `drainInbox()` opens every item, then for each one:
    - **valid:** add it with the fixed ID `m-tg-{docId}`, skipping it if that ID already exists (so a crash between adding and deleting can't create a duplicate), then delete the inbox doc;
    - **invalid or ambiguous** (unknown account, no category, or the parse said `needs_info`): put it on a *Da rivedere* list and keep the inbox doc;
    - **`cancel`:** remove the referenced `m-tg-*` entry, or drop the referenced item if it's still in the inbox.
- **`main.js`:** run `drainInbox()` after `showApp`, in the background. Show a toast like *"3 movimenti da Telegram"*.
- **Movimenti:** a *Da rivedere* banner opens the existing entry form (`views/transactions/entry-form.js`) pre-filled, with the original Telegram text above it. Saving or discarding deletes the inbox doc.
- **Conti:** a small *Telegram* card with **Collega** (generates the keys and shows the public key and your UID to copy into the Worker) and **Rigenera chiave**.
- **Hints:** after unlock, and after any change to accounts, categories or rules, write `users/{uid}/bot/hints = { json, updatedAt }` in plaintext, a moment after the last change and only when something changed. `json` holds `{ v, accounts, defaultAccount, categories: { expense, income }, tags }` (`public/js/domain/bot-hints.js`); the default account is the one most used for manual expenses in the last 90 days. This is the one place data leaves the encryption (see *Decisions*).

## 5. Build order

1. Inbox crypto and its tests.
2. App side: key setup, drain, review list. Test it end to end with a small `scripts/fake-inbox-item.js` that seals an item and writes it with the bot's credentials. No Telegram or Claude needed yet.
3. Firebase: the bot user, the rules and the second API key.
4. Worker: webhook, Claude parse, seal and write, replies. Deploy, then run `setWebhook` with the secret token.
5. Cancel and follow-up questions, `/aiuto`.
6. Add a "Telegram bot" section to DEPLOY.md and a line to README.

## Decisions (2026-11-16)

- **Hints: plaintext doc.** Account names, category names and the default account are written unencrypted to `users/{uid}/bot/hints`, readable only by you and the bot. Amounts, transactions, rules and balances stay encrypted. Rejected: a hand-synced Worker secret (goes stale), and no hints (vaguer confirmations, more reviews).
- **Auto-add valid items.** Valid inbox items are saved at unlock. Only invalid or ambiguous ones go to *Da rivedere*. The Telegram confirmation plus **Annulla** is the review step.
- **Model: `claude-haiku-5-5`** at low effort.
- **Privacy, accepted:** Telegram doesn't end-to-end encrypt messages to bots, so Telegram and Anthropic see the text of each message you send. Your stored data is unaffected.

## Later

- `/annulla` for the last transaction, without scrolling to its button (needs a little state in the Worker, e.g. Workers KV).
- Photos of receipts: Claude reads images too, so a photo could become a transaction the same way.
