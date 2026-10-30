---
version: 1
slug: "public-index-html"
primary_target: "public/index.html"
related_targets: []
---

# Surface: Expenses dashboard (public/index.html)

Scope: the single-page app. Mode: Operate. Audience: the owner, desktop first, phone second. Task: pick a period, read totals and category split, drill into transactions, correct categories and write rules.

## Direction contract

THESIS: The category standard played straight (canon), at the craft bar of Revolut / YNAB: a calm, dense finance tool where the period filter scopes everything. Refuses decoration, KPI-card mosaics of identical tiles, and gimmick charts.

OWN-WORLD: Light, cool-neutral ground with a slightly tinted sidebar layer; one deep teal-blue accent for selection and primary actions; a fixed, validated categorical palette for the top categories, everything else grouped as "Altro"; red/green reserved for out/in (deltas stay neutral, the arrow carries direction). Dark scheme follows the OS appearance (prefers-color-scheme), with chart colours stepped for the dark surface; the light scheme is the reference. Confirmed by the user on 2026-10-29: "Yes, keep it" (the dark theme that follows the system). One sans (system UI stack), tabular numerals everywhere money appears. 8px corners, hairline borders, one soft shadow level.

STORY: The owner sees how much went out and in for the chosen period, how it compares to the previous equal period, where it went by category, and the transactions behind any figure; they fix a wrong category inline or turn it into a rule.

FIRST VIEWPORT: Left rail: product name, sections (Panoramica, Movimenti, Categorie e regole). Top of work area: period control (presets segmented + custom date range) and account filter. Then a summary strip (Uscite, Entrate, Saldo, Media giornaliera with delta vs previous period), then a time-series bar chart of spending stacked by category beside a ranked category breakdown with bars. Transactions below.

FORM: canon (category standard), chosen by the user over the assigned direction. seed:65c6640701fc7b69

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
