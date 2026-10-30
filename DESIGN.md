---
name: Spese
description: Private, local dashboard for reading and correcting the owner's own spending over any period.
colors:
  accent: "#1d5c70"
  accent-hover: "#164a5a"
  accent-soft: "#e2eff2"
  accent-text: "#1a5466"
  on-accent: "#ffffff"
  bg: "#f4f5f7"
  surface: "#ffffff"
  surface-2: "#f7f8fa"
  rail: "#eceef2"
  border: "#e2e5ea"
  border-strong: "#cdd2da"
  grid: "#eceef1"
  text: "#15181d"
  text-2: "#4b5260"
  text-3: "#636b78"
  good: "#0d7a45"
  bad: "#b42828"
  bad-soft: "#fbeaea"
  tooltip-bg: "#15181d"
  tooltip-text: "#f4f5f7"
  series-1: "#2a78d6"
  series-2: "#eb6834"
  series-3: "#1baf7a"
  series-4: "#eda100"
  series-5: "#e87ba4"
  series-6: "#008300"
  series-7: "#6250d6"
  series-other: "#a3a9b2"
  flow-in: "#2f8f83"
  flow-out: "#5b6474"
typography:
  headline:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica Neue, Arial, sans-serif"
    fontSize: "1.75rem"
    fontWeight: 650
    lineHeight: 1.2
    letterSpacing: "-0.015em"
  figure:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica Neue, Arial, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 650
    lineHeight: 1.25
    letterSpacing: "-0.01em"
    fontFeature: "tnum"
  title:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica Neue, Arial, sans-serif"
    fontSize: "1rem"
    fontWeight: 650
    lineHeight: 1.3
  body:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica Neue, Arial, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.45
  label:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica Neue, Arial, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 550
    lineHeight: 1.45
  meta:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica Neue, Arial, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 400
    lineHeight: 1.45
rounded:
  s: "6px"
  md: "8px"
  l: "12px"
  pill: "999px"
spacing:
  "1": "4px"
  "2": "8px"
  "3": "12px"
  "4": "16px"
  "5": "20px"
  "6": "24px"
  "8": "32px"
  "10": "40px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.on-accent}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "0 16px"
    height: "36px"
  button-primary-hover:
    backgroundColor: "{colors.accent-hover}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.md}"
    padding: "0 16px"
    height: "36px"
  button-secondary-hover:
    backgroundColor: "{colors.surface-2}"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.text-2}"
    rounded: "{rounded.md}"
    padding: "0 16px"
    height: "36px"
  button-ghost-pressed:
    backgroundColor: "{colors.accent-soft}"
    textColor: "{colors.accent-text}"
  segmented-button-selected:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.accent-text}"
    typography: "{typography.label}"
    rounded: "{rounded.s}"
    padding: "0 12px"
    height: "28px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "0 12px"
    height: "34px"
  panel:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.l}"
    padding: "20px"
  nav-link-active:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.accent-text}"
    rounded: "{rounded.md}"
    padding: "8px 12px"
  toast:
    backgroundColor: "{colors.tooltip-bg}"
    textColor: "{colors.tooltip-text}"
    rounded: "{rounded.md}"
    padding: "12px 16px"
---

# Design System: Spese

## Overview

**Creative North Star: "The Quiet Ledger"**

Spese is the finance-tool category standard played straight: a calm, dense operating surface in the lineage of Revolut and YNAB, where the period filter scopes everything and the numbers are the interface. Cool-neutral grounds, white panels with hairline borders, one deep teal-blue accent for selection and primary action, and a fixed, validated categorical palette that follows each category everywhere it appears.

Density is deliberate. Body text sits at 14px, labels and metadata at 13px and 12px, and every amount uses tabular numerals so columns align. Hierarchy comes from weight (450 / 550 / 650 on the system sans) and from three steps of text grey, never from decoration. The light scheme is the reference; a dark scheme follows the OS appearance automatically, with surfaces, accent and chart series re-stepped for the dark ground (confirmed by the owner).

The system refuses decoration, mosaics of identical KPI tiles, and gimmick charts. The summary is one panel divided by hairlines, the time series is a plain stacked bar chart, and the category breakdown is a ranked list with thin bars.

**Key Characteristics:**
- One system sans, tabular numerals wherever money appears.
- One accent (deep teal-blue) for selection, focus and primary action only.
- Category colour is bound to the category, not to its rank in the current period.
- Deltas are neutral grey; a trend arrow carries direction.
- Flat white panels on a cool-grey ground, one soft shadow level plus one pop level.
- Dark scheme follows `prefers-color-scheme`; light is the reference.

## Colors

A cool, nearly colourless neutral frame that lets one teal-blue accent and a fixed categorical palette do all the signalling.

### Primary
- **Deep Harbour Teal** (accent): primary buttons, active nav and segmented states (via accent-text), focus ring, checkbox and switch fill, the brand mark. Hover deepens to accent-hover; accent-soft is the pressed/selected wash for ghost buttons and text selection. In dark mode it lifts to a light aqua (#6bbccc) with near-black on-accent text.

### Neutral
- **Cool Mist** (bg): app ground behind panels.
- **Paper White** (surface): panels, inputs, active nav pill, selected segment.
- **Faint Slate** (surface-2): hover wash for rows, ghost and icon buttons; segmented-control trough; rule preview box.
- **Rail Grey** (rail): sidebar layer, one step tinted below the ground.
- **Hairline** (border) and **Firm Hairline** (border-strong): panel and divider strokes; border-strong for input and secondary-button outlines and the chart x-axis.
- **Gridline** (grid): chart gridlines and the empty track of rank bars.
- **Ink** (text), **Slate Ink** (text-2), **Muted Slate** (text-3): primary text; secondary text, labels and inactive controls; metadata, table headers, placeholders.
- **Inverse Tooltip** (tooltip-bg / tooltip-text): chart tooltips and the toast; inverts per scheme.

### Semantic
- **Ledger Green** (good): income amounts in transaction lists.
- **Alarm Red** (bad / bad-soft): error text, error toast, destructive icon-button hover. Not used for expense amounts; expenses are plain ink with a minus sign.

### Data Series
- **Category slots** (series-1 to series-7): blue, orange, green, amber, pink, deep green, violet, assigned in fixed order to the seven heaviest expense (or income) categories across all data. Each has a stepped dark-mode value.
- **Altre categorie** (series-other): neutral grey for everything outside the seven slots.
- **Flow pair** (flow-in teal, flow-out slate): the income-versus-spending chart. Deliberately not green/red.

### Named Rules
**The Bound Colour Rule.** A category's colour is assigned from its all-time rank and never changes with the selected period. Charts, legends, swatches and rank bars all read the same `--series-*` variable.

**The Neutral Delta Rule.** Period-over-period changes are grey text with a trend-up or trend-down arrow. Colour never judges a delta; red and green stay reserved for money direction and errors.

**The One Accent Rule.** Teal-blue marks selection, focus and the primary action. It is never a decorative fill, a chart series, or a heading colour.

## Typography

**Body Font:** system UI stack (ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica Neue, Arial, sans-serif)

**Character:** A single native sans, tuned with intermediate weights (450, 550, 650) so dense tables stay legible and headings stay quiet. There is no display face; the largest type is the view title.

### Hierarchy
- **Headline** (650, 1.75rem, 1.2, -0.015em): view titles (Panoramica, Movimenti, Categorie e regole). Drops to 1.5rem under 860px.
- **Figure** (650, 1.5rem, 1.25, -0.01em, tabular): summary totals. Drops to 1.25rem under 480px.
- **Title** (650, 1rem, 1.3): panel titles, brand name.
- **Body** (400, 0.875rem, 1.45): default text, table cells, inputs. Empty-state copy is capped at 52ch.
- **Label** (550, 0.8125rem): field labels, figure labels, buttons, segmented options, legends, deltas.
- **Meta** (400-600, 0.75rem): table headers (600, +0.02em, sentence case), row sub-lines, rank metadata, sidebar footer.

### Named Rules
**The Tabular Money Rule.** Every amount, date input and delta renders with `font-variant-numeric: tabular-nums`; numeric columns align right.

**The Weight-Not-Size Rule.** Within a panel, hierarchy is weight and grey step, not size jumps. Three text greys and three weights carry it.

## Layout

A two-column app shell: a 224px sticky sidebar rail and a work area capped at 1440px with 24px/32px padding. A sticky period bar sits at the top of the work area, bleeding to its edges, on a 92% translucent ground with a hairline bottom border and backdrop blur; everything below is scoped by it.

Content stacks in 20px gaps. The overview uses a 1.75fr / 1fr grid (chart beside ranked categories); secondary rows use 1.2fr / 1fr; the rules view 1.35fr / 1fr. All grids collapse to one column at 1180px.

Spacing follows a 4px base scale (4, 8, 12, 16, 20, 24, 32, 40). Panels pad 20px; the summary panel 20px by 24px.

Responsive steps:
- **1000px:** summary figures go from 4 to 2 columns.
- **860px (phone):** the rail becomes a 56px top bar (brand, import, lock) and the sections move to a bottom tab bar (Panoramica · Movimenti · Nuovo · Regole) above the safe-area inset. The period bar shrinks to one sticky row, ‹ period name and dates ›, that opens in place onto presets, dates, grouping and account. The app opens on "Questo mese"; on the overview, categories come before the charts.
- **640px:** transaction tables become stacked rows. Sorted by date they are grouped under day headers, two lines per row (description and amount, then category and account); tapping a row opens it to the category menu and its actions. Rule fields go single-column.
- **480px:** summary figures shrink with the viewport and never wrap; the "Ricategorizzati" column hides.

Touch devices (`pointer: coarse`) get 44px targets (segments and chips 40px) and 16px field text so iOS never zooms on focus; precise pointers keep the compact desktop sizes. Row hover tints apply only where hover exists.

## Elevation & Depth

Mostly flat with tonal layering: rail sits below the ground, panels sit on it as white planes with a hairline border and one barely-there shadow. A second, stronger shadow is reserved for things that float over content.

### Shadow Vocabulary
- **Resting** (`0 1px 2px rgb(20 28 40 / 0.05), 0 1px 3px rgb(20 28 40 / 0.06)`): panels, active nav pill, selected segment.
- **Pop** (`0 10px 28px rgb(20 28 40 / 0.16), 0 2px 6px rgb(20 28 40 / 0.08)`): toast and anything overlaying content.
- **Focus ring** (`0 0 0 3px rgb(29 92 112 / 0.32)`): all keyboard focus, replacing outlines.

Dark mode flattens both shadows to black-alpha (0.3 and 0.45) and depth is carried mainly by the surface steps.

### Named Rules
**The Two-Shadow Rule.** Resting surfaces use the resting shadow; only floating layers use pop. No third level.

## Shapes

Soft, consistent corners at three steps: 6px inside compact controls (segment buttons), 8px for interactive controls (buttons, inputs, nav links, rank rows, toast, chart tooltip), 12px for panels and containers. The segmented trough uses 10px (8 + 2) to nest its 6px buttons. Pills only for the switch track. Chart bars round only their data end (4px top), stacked segments are separated by a 2px surface-coloured gap, and swatches are 10px squares with 3px corners. Strokes are 1px hairlines throughout.

## Components

### Buttons
Restrained and compact.
- **Shape:** gently rounded (8px), 36px tall; small variant 30px with 13px text.
- **Primary:** accent fill, on-accent text, weight 550; hover deepens to accent-hover; disabled at 55% opacity.
- **Secondary:** surface fill with border-strong outline; hover to surface-2.
- **Ghost:** transparent, text-2; hover surface-2; pressed state (aria-pressed) uses accent-soft with accent-text.
- **Icon button:** 32px square, transparent, text-2; hover surface-2. Danger variant hovers to bad-soft / bad.
- **Link button:** accent-text, 13px, underline on hover.
- All transitions: 180ms on the shared ease-out curve.

### Segmented Control
The period presets and the Uscite/Entrate switch. Surface-2 trough with hairline border and 3px inset; options are 28px, 13px/550, text-2. The selected option becomes a white raised chip (resting shadow) with accent-text.

### Inputs / Fields
- **Style:** surface fill, border-strong 1px, 8px corners, 34px tall (compact variant 28px, 13px text).
- **Hover:** border darkens to text-3. **Focus:** border becomes accent plus the focus ring.
- **Labels:** 13px/550 text-2, above or inline. **Error:** 13px/550 in bad, placed under the field it concerns; that field gets a bad border, `aria-invalid` and focus.
- **Check / Switch:** native checkbox tinted with accent; switch is a 32x18 pill, border-strong off, accent on.

### Cards / Containers
- **Panel:** surface, 1px border, 12px corners, resting shadow, 20px padding; flush variant (no padding) for tables. Header pairs a 16px/650 title with a 13px text-3 sub-line.
- **Summary strip:** one panel, four figures divided by vertical hairlines (not four cards). The main figure's label is coloured accent-text.

### Navigation
Sidebar rail on rail grey. Links are icon plus label, 500 weight, text-2; hover is a 6% ink wash; the current page is a white pill with resting shadow and accent-text. Under 860px it becomes a bottom tab bar on translucent rail grey with a hairline top border: 20px icon over a 12px short label, text-3, the current section in accent-text without a pill. "Nuovo" sits third as a 40x24 accent capsule.

The URL carries the route, the period and the explored category (`#/panoramica?p=12m&cat=Casa`). Zooming from a chart and drilling into a category add a history entry, so Back undoes them.

### Filter Chips
Pills under the overview title for anything narrowing the view beyond the period: "← Torna a 12 mesi" after a chart zoom (surface with border-strong), "Categoria: Casa ✕" while drilling (accent-soft, accent-text). One tap removes them.

### Data Table
Hairline row separators, 8px by 12px cells, sticky header in 12px/600 text-3 with sentence case. Rows hover to surface-2; sortable headers turn accent-text when active. Row actions reveal on hover/focus on pointer devices and stay visible on touch.

### Ranked Category List (signature)
Each row: swatch and name (550), amount (600, tabular) right, then a 6px bar in the category colour over a grid-coloured track, then metadata (share, count) and a neutral delta. Whole row is a button with 8px corners and surface-2 hover, drilling into transactions.

### Stacked Bar Chart (signature)
Chart.js themed entirely from CSS variables (font, text-2 ticks, grid lines, inverse tooltip with 8px corners). No legend inside the canvas; an HTML legend of swatches sits below. Max bar thickness 36px, y-axis capped at five ticks with compact euro labels, x gridlines off. Each chart offers a table alternative. On touch, the first tap on a bar shows its tooltip and a second tap on the same bar zooms the period, so reading a value never changes the period.

### Toast
Bottom-centred (above the tab bar on phone), inverse tooltip colours, 8px corners, pop shadow; slides up 8px and fades in over 180ms. Error tone uses bad fill.

## Do's and Don'ts

### Do:
- **Do** read every colour, including chart colours, from the CSS custom properties so both schemes stay in sync.
- **Do** use tabular numerals and right alignment for every amount.
- **Do** show period comparisons as grey text with a trend arrow and "vs periodo prec."; past +1000% show the multiple ("×13") instead of the percentage.
- **Do** assign category colours from the fixed seven-slot order and group the rest as "Altre categorie" in series-other.
- **Do** separate figures inside one panel with hairlines rather than splitting them into cards.
- **Do** use 8px corners for controls and 12px for panels; 1px hairlines for every stroke.
- **Do** use Lucide-style stroked SVG icons inline, one style across the interface.
- **Do** step every new colour for the dark scheme inside the `prefers-color-scheme: dark` block.

### Don't:
- **Don't** colour deltas red or green; the arrow carries direction.
- **Don't** use the accent as a chart series, decorative fill or heading colour.
- **Don't** build rows of identical KPI tiles.
- **Don't** add decorative or gimmick chart types (gauges, 3D); bars and ranked lists carry the data.
- **Don't** introduce a third shadow level or hard offset shadows.
- **Don't** add a second typeface.
