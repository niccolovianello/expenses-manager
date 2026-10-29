# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Static site (`public/`, vanilla ES modules, Chart.js from CDN) published on GitHub Pages from the personal account `niccolovianello`. Data on Firebase (Authentication + Firestore), encrypted in the browser. A zero-dependency Node server serves `public/` for local development only.

## Users

One person (the owner) reviewing their own personal finances on a desktop browser, occasionally on a phone. They export transactions from a budgeting app and want to understand where money goes over arbitrary periods.

## Product Purpose

Load the exported movements (Spese, Entrate, Bonifici), categorize expenses, and show charts and totals for any chosen period. Success: in a few seconds the owner can answer "how much did I spend on X in period Y, and how does it compare?".

## Positioning

Private, owner-tuned: categories come from the source app but can be corrected per transaction and by reusable rules the owner writes. Only the owner, with the secret code, can read the data: it is encrypted in the browser before reaching Firebase.

## Operating Context

- Source: xlsx export from a budgeting app (sheets `Spese`, `Entrate`, `Bonifici`; Excel serial dates; amounts in EUR; columns Categoria, Conto, Tag, Commento).
- Several accounts: bank accounts, cards, payment apps, meal vouchers, cash and shared-expense wallets.
- Bonifici are transfers between the owner's own accounts: shown, never counted as spending or income.
- A few thousand movements over several years.

## Capabilities and Constraints

- Categorization: keep source categories, allow manual per-transaction re-categorization, and rules (field contains text → category), saved encrypted on Firestore.
- Variable periods: presets plus custom date range, with time granularity adapting.
- No transaction data in the HTML or the repository. Access requires the secret code; without it, not even developer tools show data (Firestore rules + AES-GCM encryption).
- Language: Italian UI.

## Evidence on Hand

The real export lives only locally in `data/` (git-ignored) and, encrypted, on Firebase. No other assets.

## Product Principles

1. The numbers are the interface: totals and comparisons before decoration.
2. Every figure is traceable to the transactions behind it.
3. Corrections are cheap and durable.
4. Private by default: data leaves the browser only encrypted, with a key no one else holds.
