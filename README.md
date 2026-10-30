# Spese

Personal expense analysis built from the budgeting app's xlsx export (sheets `Spese`, `Entrate`, `Bonifici`).
Static site on GitHub Pages; the data lives on Firebase, encrypted in the browser with a secret code. See [DEPLOY.md](DEPLOY.md).

The app's interface is in Italian; section and button names below are quoted as they appear in it.

- **Panoramica** (overview): expenses, income, balance and average spending for any period, compared with the previous period; trend by category, income versus expenses, category ranking with a per-tag breakdown, top expenses. Click a bar to zoom into that interval.
- **Movimenti** (transactions): search, filters, sorting and re-categorization from each row's menu. **Nuovo movimento** adds expenses, income and transfers by hand, which can then be edited or deleted; they survive every new import, and those that also appear in the export (same kind, date, amount and accounts) are removed so they are not counted twice.
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
