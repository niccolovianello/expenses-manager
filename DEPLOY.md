# Deploy: GitHub Pages + Firebase

The site is static (the `public/` folder) and is published at
**https://niccolovianello.github.io/expenses-manager/** from the personal GitHub account `niccolovianello`.

## How the data is protected

| Layer | What it does |
|---|---|
| **Secret code** | Never leaves the browser and is never stored. Two independent secrets are derived from it with PBKDF2 (600,000 iterations). |
| **Firebase Authentication** | A single email/password user. The password is *derived* from the code, so Firebase never sees the code itself. Sign-ups are disabled. |
| **Firestore rules** | `users/{uid}/**` can be read and written only by that user; everything else is closed (`firestore.rules`). Without logging in, the API returns `permission-denied`. |
| **Client-side encryption** | Movements, rules and corrections are compressed and encrypted with AES-GCM 256 before upload. The key comes from the code plus a random salt, and never leaves the browser. Firestore holds only ciphertext. |
| **Session** | An unlock is remembered for 24 hours (`rememberHours`), so reloading the page does not ask for the code. The data key is kept in the browser's IndexedDB as a non-extractable key; the code itself is never stored. **Blocca** or 15 minutes of inactivity locks the app and forgets the session. |

What is visible in developer tools **without the code**: the app's source and the public Firebase configuration (normal and harmless). No data.

> Security rests on the code. Use a long passphrase (at least 12 characters, better 4–5 random words). If you lose it, the data cannot be recovered: re-import the export after resetting (see below).

## 1. Firebase project (personal Google account)

1. On https://console.firebase.google.com create a project (e.g. `spese-niccolo`). Google Analytics is not needed.
2. **Build → Authentication → Get started → Sign-in method**: enable **Email/Password** (not the passwordless link).
3. **Authentication → Settings → User actions**: turn off **Enable create (sign-up)**. Leave **Email enumeration protection** on.
4. **Authentication → Settings → Authorized domains**: add `niccolovianello.github.io`.
5. Pick the secret code and compute the password for Firebase on your computer:
   ```bash
   npm run derive-password -- your@email.com
   ```
   The code is typed without being shown and does not leave the computer.
6. **Authentication → Users → Add user**: your email + the password printed in step 5.
7. **Build → Firestore Database → Create database**: production mode, `eur3` (Europe) region.
8. **Firestore → Rules**: paste the contents of `firestore.rules` and **Publish**.
9. **Project settings → General → Your apps → Web (`</>`)**: register an app (no Hosting). Copy `apiKey`, `authDomain`, `projectId`, `appId` into `public/js/config.js`, together with `accountEmail`.
10. (Recommended) On https://console.cloud.google.com/apis/credentials restrict the browser API key to the referrers `https://niccolovianello.github.io/*` and `http://127.0.0.1:5173/*`.

## 2. GitHub repository (personal account `niccolovianello`)

GitHub Pages on the free plan requires a **public** repository. That is fine: only code is committed, never data (`data/` is in `.gitignore`).

The repository uses the personal identity only locally (`git config` inside the repo), without touching the work account:
```bash
git config user.name "niccolovianello"
git config user.email "48092501+niccolovianello@users.noreply.github.com"
GH_TOKEN=$(gh auth token --user niccolovianello) gh repo create niccolovianello/expenses-manager --public --source . --push
```
Then on GitHub: **Settings → Pages → Source: GitHub Actions**. Every push to `main` runs the tests and publishes `public/` (`.github/workflows/pages.yml`).

## 3. First use

Open the site, enter the code, choose the `.xlsx` export: it is read in the browser, encrypted and saved on Firestore. For later updates, use **Importa export** in the sidebar.

## Local development

```bash
npm start   # http://127.0.0.1:5173, same Firebase configuration
npm test
```

## Changing the code or starting over

- **New code**: recompute the password with `npm run derive-password`, update it on the user in Authentication, then delete the `users/{uid}` document and its `blobs` subcollection on Firestore, and re-import the export (rules and corrections are encrypted with the old key).
- **Data deletion**: delete `users/{uid}` and `users/{uid}/blobs/*` from the Firestore console.

## Telegram bot (optional)

Expenses written to a Telegram bot reach the app through an encrypted inbox; how it works is in [TELEGRAM-BOT.md](TELEGRAM-BOT.md). This part sets up Firebase for it. The Worker that runs the bot comes later.

### 1. The bot's Firebase user

1. Make a long random password for the bot (it is stored only in the bot's configuration, never in the repository):
   ```bash
   openssl rand -base64 32
   ```
2. **Authentication → Users → Add user**: email `bot@spese.niccolovianello.invalid` (exactly this: the rules recognize the bot by it), password from step 1. Adding a user here works even with sign-ups disabled.

### 2. Rules

**Firestore → Rules**: paste the current contents of `firestore.rules` and **Publish**. Besides the existing rule, they let the bot:
- create items in `users/{uid}/inbox`, only with the fields and sizes the app expects, and only for a user that already exists;
- read `users/{uid}/bot/hints`.

The bot cannot read, change or delete anything else, inbox items included.

The **Rules Playground** on the same page can check them before publishing: simulate a `create` on `users/<your uid>/inbox/test` authenticated as the bot (provider `password`, email above), then a `get` on `users/<your uid>/blobs/entries` as the bot, which must be denied.

### 3. An API key for the bot

The browser key only accepts requests from the site, and a Worker sends none of those headers, so the bot gets its own key.

1. https://console.cloud.google.com/apis/credentials (same project) → **Create credentials → API key**. Name it e.g. `telegram-bot`.
2. **Application restrictions**: none (the Worker has no fixed address).
3. **API restrictions → Restrict key**: only **Identity Toolkit API** and **Cloud Firestore API**.

### 4. The inbox key and your user id

Open the app, unlock it, go to **Conti → Telegram → Collega Telegram**. Copy the two values shown.

### 5. Try it without Telegram

Create `bot/.dev.vars` (git-ignored; the Worker will read the same file when run locally):
```
FIREBASE_API_KEY="key from step 3"
FIREBASE_PROJECT_ID="money-manager-79b34"
BOT_EMAIL="bot@spese.niccolovianello.invalid"
BOT_PASSWORD="password from step 1"
OWNER_UID="ID utente from Conti"
INBOX_PUBLIC_KEY='{"kty":"EC",...}  (Chiave pubblica from Conti, as copied)'
```
Then put a test transaction and an incomplete one in the inbox, the way the bot will:
```bash
node --env-file=bot/.dev.vars scripts/fake-inbox-item.js 'prova 1,23' '{"amount":1.23,"account":"<one of your accounts>","category":"<one of your categories>","comment":"Prova Telegram"}'
node --env-file=bot/.dev.vars scripts/fake-inbox-item.js 'prova senza conto' '{"amount":4.56,"account":null,"category":null}'
```
Reload the app: the first one is added (toast *1 movimento aggiunto da Telegram*), the second waits in **Movimenti → Da Telegram, da rivedere**. Delete the test transaction afterwards from its row.

To take the bot's access away at any time: disable or delete its user in **Authentication → Users**.

### 6. The bot on Telegram

In Telegram, talk to **@BotFather**: `/newbot`, pick a name and a username. It answers with the bot's **token**: keep it like a password.

### 7. The Worker on Cloudflare

The bot runs as a Cloudflare Worker (the free plan is enough), from the `bot/` folder.

1. An Anthropic API key for the bot: https://console.anthropic.com → **API keys**. A spending limit on the workspace is a good idea; with Claude Haiku 5.5 each message costs a fraction of a cent.
2. Install and log in:
   ```bash
   cd bot && npm install && npx wrangler login
   ```
   npm may refuse to run the install script of `workerd`. Deploying does not need it; only `npx wrangler dev` (running the bot locally) does: allow it with `npm install-scripts approve workerd` and install again.
3. A secret for Telegram's requests, so only Telegram can call the Worker:
   ```bash
   openssl rand -hex 32
   ```
4. Store the secrets in the Worker, one at a time (each command asks for the value):
   ```bash
   npx wrangler secret put TELEGRAM_TOKEN           # from @BotFather
   npx wrangler secret put TELEGRAM_WEBHOOK_SECRET  # from step 3
   npx wrangler secret put ANTHROPIC_API_KEY
   npx wrangler secret put FIREBASE_API_KEY         # the bot's key, section 3
   npx wrangler secret put BOT_PASSWORD             # section 1
   npx wrangler secret put OWNER_UID                # Conti → Telegram
   npx wrangler secret put INBOX_PUBLIC_KEY         # Conti → Telegram, the whole {...}
   ```
   `MODEL`, `FIREBASE_PROJECT_ID` and `BOT_EMAIL` are not secret and are in `bot/wrangler.toml`.
5. Deploy: `npm run deploy`. It prints the Worker's address, `https://spese-telegram-bot.<subdomain>.workers.dev`.
6. Add `TELEGRAM_TOKEN` and `TELEGRAM_WEBHOOK_SECRET` to `bot/.dev.vars` too, then point Telegram at the Worker:
   ```bash
   npm run set-webhook -- https://spese-telegram-bot.<subdomain>.workers.dev
   ```
7. Write anything to the bot. Until it knows your chat, it only answers with your **chat id**: store it, and the Worker updates by itself:
   ```bash
   npx wrangler secret put ALLOWED_CHAT_ID
   ```
   From then on it ignores every other chat.

### 8. First expense

The bot needs the names of your accounts and categories: the app writes them (in plain text, names only) every time it is unlocked after **Collega Telegram**, and again whenever they change. So open the app once, then write to the bot: `pizza 18,50 ieri`. It answers with what it understood and an **Annulla** button; the next time you open the app the transaction is there.

When something does not work, `npx wrangler tail` (from `bot/`) shows the Worker's logs live.
