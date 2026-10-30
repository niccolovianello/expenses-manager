---
target: mobile website design
total_score: 24
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
target_identity: "file:/Users/niccolovianello/Desktop/Personale/personalprojects/expenses-manager/public/index.html"
target_fingerprint: "sha256:ad3d51c39a23a2c5d1d75903a6266fda5e9af623c47614d6d54433cc9d8e0257"
target_path: /Users/niccolovianello/Desktop/Personale/personalprojects/expenses-manager/public/index.html
timestamp: 2026-10-30T11-29-45Z
slug: public-index-html
---
# Critique — mobile (375/320px), public/index.html

Method: dual-agent (A: design review · B: detector + browser evidence). Live app mounted with synthetic in-memory data (617 movements).

## Heuristics — 24/40 (Acceptable)
1 Status 2 — hidden drill-down; period changes off-screen
2 Real world 3 — "Clic…" desktop copy
3 Control 2 — chart tap replaces period, no undo/back
4 Consistency 3 — funnel icon = "Crea regola"
5 Error prevention 2 — 28–35px targets; errors shift submit
6 Recognition 3 — icon-only inactive nav <480px
7 Efficiency 2 — 100 × 107px rows, no day grouping
8 Minimalist 3 — 258px of chrome before content
9 Error recovery 2 — error far from field, field not marked
10 Help 2 — tap/drill behaviour unexplained

## Priority issues
- [P1] Chart tap = immediate global period change (bar-chart.js:60), invisible because period bar isn't sticky on phone; no undo, period not in URL.
- [P1] Top nav doesn't fit: active "Categorie e regole" clipped at 375; Categorie tab hidden behind actions at 320 (layout.css:146-200). No safe-area insets anywhere.
- [P1] Scroll not reset on route change (shell.js:30); "Crea regola" from a row lands mid-page with focus on body (rule-form.js:154-156).
- [P2] Touch targets 16–35px across the app (presets 28px, row selects 163×28, checkbox 16×16, row-link 20px); all inputs 13–14px → iOS zoom on focus. No `(pointer: coarse)` layer.
- [P2] Controls before content: rail 52 + period bar 206px; first transaction at y≈616. Drill-down state (e.g. Casa) persists across views with no header cue.

## Minor
Kind segmented overflows card by 11px at 320; date inputs truncate at 320; categories table scrolls sideways with clipped header; hover tints stick after tap; large figures nearly overflow at 320; huge deltas on sparse bases; charts may not shrink on rotation (unverified); 9 detector advisories (6 colour token-format false positives, 3× 3px radius).
