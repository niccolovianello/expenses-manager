---
target: critique (whole app)
total_score: 25
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
target_identity: "file:/Users/niccolovianello/Desktop/Personale/personalprojects/expenses-manager/public/index.html"
target_fingerprint: "sha256:f23ef9acbb718c06ea8c496ab5ab26f0759f398ac3583d633889e7ab55c72635"
target_path: /Users/niccolovianello/Desktop/Personale/personalprojects/expenses-manager/public/index.html
timestamp: 2026-11-02T14-50-38Z
slug: public-index-html
---
# Critique: public/index.html (desktop + phone, light + dark), 2026-11-02

Method: dual-agent (A: design review · B: detector + browser evidence). Live app mounted with synthetic in-memory data (1,428 movements).

## Heuristics: 25/40 (Acceptable)
1 Status 3: drill-down chip looks like a filter but summary stays all-category
2 Real world 2: ‹ on "Questo mese" (1–2 Nov) gives 1–2 Oct; › walks into the future
3 Control 3: zoom/drill now undoable; rule delete has no confirm/undo; Esc discards dirty forms
4 Consistency 2: native confirm vs none; "-" vs "−"; red negative balances; account palette off-token
5 Error prevention 2: "Crea regola" pre-fills a no-op rule; balance edit has no Δ check
6 Recognition 3: rule preview + datalist good; phone rule icon unlabelled, filter-like
7 Efficiency 2: no shortcuts, no bulk/"apply to similar", zoom pointer-only
8 Minimalist 3: calm and dense; period range repeated 3×; ring duplicates the list
9 Error recovery 2: one validation error at a time (3 submits to find 3 fields)
10 Help 3: good subtitles; Conti balance model reads like engineering copy

## Priority issues
- [P1] ‹ › on partial presets steps by day-length (periods.js:57-68): "Questo mese" ‹ → 1–2 Oct; › unbounded into the future. Fix: calendar-aligned stepping with named label, disable › at today. → clarify/harden
- [P1] "Crea regola" pre-fills full comment + current category → preview "0 cambierebbero" (transactions/index.js:121-123). Fix: merchant token, empty+focused category or the one just chosen; offer rule from the recategorise toast. → clarify
- [P2] Keyboard focus: ring is 32%-alpha box-shadow, 1.68:1 light / 2.36:1 dark (fails 3:1); active nav link loses it entirely (layout.css:52 box-shadow overrides :focus-visible); focus drops to body after drill-down and inline recategorise. → audit/polish
- [P2] Destructive/money actions lack safeguards: rule delete no confirm/undo (actions.js:309), Esc discards dirty forms, balance edit no old→new Δ, native window.confirm elsewhere. → harden
- [P2] Desktop sticky period bar covers the entry form's header; scroll-margin-top only under 860px (views.css:686-690). Summary figures overflow by 32px at 1024 wide (dd.figure-value). → layout
- [P2] Conti drifts from the system: 14 raw hexes not stepped for dark (domain/accounts.js:23), red negatives (views.css:752), hyphen minus, colour radios announced as hex; DESIGN.md stale (nav, Conti, ring, recurring). → polish/colorize/document

## Detector
CLI 23 advisory (exit 0): 3× border-radius 3px (components.css:344, views.css:247,255) real; switch-thumb shadow not tokenised (components.css:316) real; 5 login dark-token + 14 accounts.local.js colour findings false positives. Overlay: text-overflow on dd.figure-value at 1024 (light+dark); monotonous ~4px spacing on panoramica/conti/categorie (advisory). No console errors, no page overflow at 375/320, muted text contrast all ≥4.63.

## Prior P1s
All three fixed: chart tap → two-tap + "Torna a" chip + URL/back; phone bottom bar fits with safe-area; scroll reset on route change.

## Minor
Phone Movimenti: recurring panel before first transaction; category select clipped; row-toggle 32×28 (hit area extended to 44); segmented 40px tall; brand link 28px tall; switch 32px wide. Ring in drill-down = 6 indistinguishable tints. Rules-page category click silently sets period to Tutto (category-table.js:32). Conti hash carries ?p=12m. Phone deltas over 2 days (+132%) are noise.
