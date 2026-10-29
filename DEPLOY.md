# Deploy: GitHub Pages + Firebase

The site is static (the `public/` folder) and is published at
**https://niccolovianello.github.io/expenses-manager/** from the personal GitHub account `niccolovianello`.

## How the data is protected

| Layer | What it does |
|---|---|
| **Secret code** | Never leaves the browser and is never stored. Two independent secrets are derived from it with PBKDF2 (600,000 iterations). |
| **Firebase Authentication** | A single email/password user. The password is *derived* from the code, so Firebase never sees the code itself. Sign-ups are disabled. |
| **Firestore rules** | `users/{uid}/**` can be read and written only by that user; everything else is closed (`firestore.rules`). Without logging in, the API returns `permission-denied`. |
| **Client-side encryption** | Movements, rules and corrections are compressed and encrypted with AES-GCM 256 before upload. The key comes from the code plus a random salt, and exists only in memory. Firestore holds only ciphertext. |
| **Session** | Kept in memory only: reloading the page or 15 minutes of inactivity locks the app. |

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
