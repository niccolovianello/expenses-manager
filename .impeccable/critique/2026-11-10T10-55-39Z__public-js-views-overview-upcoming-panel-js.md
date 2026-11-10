---
target: Ricorrenti in arrivo panel
total_score: 23
max_score: 36
na_heuristics: 9
p0_count: 0
p1_count: 3
target_identity: "file:/Users/niccolovianello/Desktop/Personale/personalprojects/expenses-manager/public/js/views/overview/upcoming-panel.js"
target_fingerprint: "sha256:d3f7c47f710d1be6b80f82014f9775f469523512ce4f9d35edbe492806e19571"
target_path: /Users/niccolovianello/Desktop/Personale/personalprojects/expenses-manager/public/js/views/overview/upcoming-panel.js
timestamp: 2026-11-10T10-55-39Z
slug: public-js-views-overview-upcoming-panel-js
---
Method: dual-agent (A: design review · B: detector + browser overlay)
Scope: "Ricorrenti in arrivo" overview panel only (upcoming-panel.js, .upcoming-* CSS, placement in overview/index.js).

## Design Health Score
| # | Heuristic | Score | Key Issue |
|---|---|---|---|
| 1 | Visibility of System Status | 2 | Header "Uscite" includes today's occurrences, already counted in the summary strip |
| 2 | Match System / Real World | 2 | "In arrivo" title vs "Già inclusi nei totali di oggi" on Oggi; "Mar 17 Nov" casing |
| 3 | User Control and Freedom | 3 | Row tap leaves the overview without warning |
| 4 | Consistency and Standards | 3 | Reuses Movimenti row; accent "Oggi" breaks One Accent Rule; Uscite/Entrate mimic the strip |
| 5 | Error Prevention | 2 | aria-label implies editing one date; form edits whole series |
| 6 | Recognition Rather Than Recall | 3 | Phone hides account column, giroconto loses direction |
| 7 | Flexibility and Efficiency | 2 | "E altri N" is dead text |
| 8 | Aesthetic and Minimalist Design | 3 | Calm; daily recurrences flood the 8 rows |
| 9 | Error Recovery | n/a | No inputs or error states |
| 10 | Help and Documentation | 3 | Sub-lines explain the window; nothing explains totals include today |
| **Total** | | **23/36** | Good (64%, low end) → Acceptable |

## Priority Issues
- [P1] Header totals and today's rows double up with the summary strip. Fix: window starts tomorrow (drop panel on Oggi or show "Domani"), rename sums "Ancora in uscita/entrata", or one projected end-of-period balance line.
- [P1] 8-row cap counts occurrences, so small daily items hide rent/salary. Fix: one row per recurrence ("×4 entro il 30 nov · 6,00 €") or expandable "E altri N · −30,00 €".
- [P1] On phone the ~600px panel pushes categories below the fold, against DESIGN.md. Fix: disclosure closed under 860px with one-line heading count+total; left-align wrapped totals.
- [P2] aria-label drops amount/account/frequency and implies single-occurrence edit. Fix: full accessible name ending "Modifica la ricorrenza".
- [P2] "Oggi" in accent-text and text-transform capitalize ("Mar 17 Nov"). Fix: ink weight 600; capitalise first letter only in JS.

## Deterministic scan
CLI: 0 findings on upcoming-panel.js; 2 design-system-color findings on harness wrapper only (false positives). Overlay: "No anti-patterns found" on month/week/today desktop and month mobile.

## Minor
Double gap before "·" in sub-line; empty state persists when all recurrences ended; incoming giroconto for filtered account unsigned and unsummed; "E altri N" repeats the year; no aria-labelledby on the section; panel ignores flow/category filters.
