# Spese

Personal expense analysis built from the budgeting app's xlsx export (sheets `Spese`, `Entrate`, `Bonifici`).
Static site on GitHub Pages; the data lives on Firebase, encrypted in the browser with a secret code. See [DEPLOY.md](DEPLOY.md).

The app's interface is in Italian; section and button names below are quoted as they appear in it.

- **Panoramica** (overview): expenses, income, balance and average spending for any period, compared with the previous period; trend by category, income versus expenses, category ranking with a per-tag breakdown, top expenses. Click a bar to zoom into that interval.
- **Movimenti** (transactions): search, filters, sorting and re-categorization from each row's menu. **Nuovo movimento** adds expenses, income and transfers by hand, which can then be edited or deleted; they survive every new import, and those that also appear in the export (same kind, date, amount and accounts) are removed so they are not counted twice.
- **Conti** (accounts): every account with its current balance and the total of those not excluded from it. Tap an account to change its name, look or balance: a balance typed by hand is the truth from that moment, and every manual transaction entered afterwards moves it (expenses down, income up, transfers between the two accounts). The export has no times, so the account also remembers what the export added up to for it at that moment: whatever a later export adds or takes away (new, back-dated, edited or deleted transactions) moves the balance. A transaction in both the export and the manual list counts once. Manual transactions must use one of these accounts. The initial accounts are in `public/js/data/accounts.local.js`, which is git-ignored because the site is public: opening the app from `npm start` adds the ones not there yet, encrypted, on Firebase (each one once; same-named accounts are left alone). Initial recurring transactions work the same way, from `public/js/data/recurring.local.js` (git-ignored, each one added once by description). The Firebase API key must allow the referrer `http://127.0.0.1:5173/*` (DEPLOY.md, step 10).
- **Ricariche automatiche** (in Conti): a rule like "every Monday bring Satispay back to 50 €, taking what is missing from Conto corrente arancio" — accounts, target amount, frequency, start and optional end date are all editable. Each top-up is a transfer between the two accounts, computed from the balance at the start of its day and shown among the transactions; only days from the rule's creation on count, and a day the export already has a transfer between the two accounts for is left to the export. When an account's balance is typed again, or the rule changes, the top-ups so far keep the amount they had.
- **Categorie e regole** (categories and rules): rules like "comment contains *Dropbox* → Abbonamenti" with a preview on real data; a list of manual overrides.

Precedence: manual override → first matching active rule → export category. Transfers are shown but excluded from totals.

## Structure

```
public/                    the published site (no data inside)
  index.html               code screen + app skeleton
  css/                     tokens, base, layout, components, views
  js/
    config.js              public Firebase configuration
    vault/                 key derivation, encryption, Firebase session, encrypted store
    data/                  data repository and rule/override mutations
    import/                in-browser xlsx reader → normalized transactions
    domain/                categorization logic
    state/                 store, actions, memoized selectors
    lib/                   dates, periods, formatting, aggregation
    charts/                Chart.js: theme from CSS, palette, bar chart
    components/            login, shell, period bar, common elements
    views/                 overview, transactions, rules (one module per panel)
server/                    static server for local development
scripts/                   derives the Firebase password from the code
firestore.rules            security rules
test/                      node --test
```

```bash
npm start
npm test
```
