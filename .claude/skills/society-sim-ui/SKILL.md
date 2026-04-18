---
name: society-sim-ui
description: Apply the Society Sim OS neo-brutalist UI system to the app. Use when the user explicitly asks to redesign, restyle, or "apply the UI skill" to Society Sim OS. Produces Tailwind v4 + Geist Sans + recharts components matching the MKTG/OS reference aesthetic (yellow #f5f500 UI accent + cyan #00e5ff chart focal accent on near-black, sharp corners, 2px borders).
---

# Society Sim OS — UI Skill

## When to run

Only when the user explicitly asks ("apply the UI skill", "redesign the UI", "restyle Society Sim OS"). **Never auto-trigger.** The backend is the active workstream; this skill is intentionally deferred until the product flow is stable.

All copy is **English** (audience: SF hackathon judges).

## Product context

Society Sim OS is a market-simulation tool: LLM personas discuss a new product, producing a transcript plus per-persona scored metrics (sentiment, persuasion, passion). Charts carry ~50% of the hackathon demo weight, so the chart theme is load-bearing — treat it as seriously as the chrome.

Tabs today (keep the state machine, re-map the presentation): `simulation | products | personas | visualization | settings` → **Live Run | Catalog | Agent Registry | Intelligence | Controls**.

## Design language

### Tokens (emit into `src/index.css` under `@theme`)

```css
@theme {
  /* Surfaces */
  --color-bg: #0a0a0a;
  --color-surface: #111111;
  --color-surface-2: #0d0d0d;
  --color-border: #1e1e1e;
  --color-border-soft: #161616;
  --color-border-hair: #1a1a1a;

  /* Text */
  --color-text: #ffffff;
  --color-text-dim: #888888;
  --color-text-mute: #444444;
  --color-text-faint: #333333;

  /* Accents */
  --color-accent: #f5f500;         /* UI-only: CTA, active nav, hero KPI, focus ring */
  --color-accent-dim: #6b6b00;
  --color-accent-2: #00e5ff;       /* Charts-only: focal data series */
  --color-accent-2-dim: #006b73;

  /* Status */
  --color-ok: #22c55e;
  --color-warn: #f59e0b;
  --color-danger: #ef4444;

  /* Type */
  --font-sans: 'Geist', ui-monospace, SFMono-Regular, Menlo, monospace;

  /* Radii / shadows */
  --radius: 0px;
}
```

**Typography rules**
- Display (KPI numbers, page title): weight 900, tracking `-0.05em`, line-height 1.
- Body: weight 400–500, tracking `-0.02em`.
- Uppercase labels / eyebrows: 9–10px, weight 700, tracking `0.10em`.
- Never use italic. Never use serif.

**Spatial rules**
- Sharp corners everywhere (`border-radius: 0`).
- Borders do the work of shadows: 1px hair (`--color-border-soft`), 2px structural (`--color-border`), 2px yellow for accent edges.
- Grid gutters are **2px** between cells (matches reference). Card inner padding **18px**. Topbar height **48px**. Sidebar width **180px**.

### Dual-accent discipline (critical)

- **Yellow `--color-accent`** is for UI chrome only: the active nav pill, the primary CTA, the single hero KPI on each screen, focus rings, and `RUNNING` chips. Never a chart series fill.
- **Cyan `--color-accent-2`** is the focal chart series color. It's the visual complement that lets data pop without shouting over the yellow chrome.
- **Grayscale** (`#fff`, `#888`, `#333`, `#1a1a1a`) is the context palette for non-focal chart elements.
- **Persona palette** is categorical only (one color per persona in scatter/stacks). All 10 hues are pre-desaturated — see `src/theme/personas.ts` below.

### Persona palette (`src/theme/personas.ts`)

Desaturate toward `#888` one step from current [App.tsx:9-79](../../../src/App.tsx) so yellow + cyan stay dominant. Map by persona id:

```ts
export const personaColors: Record<string, string> = {
  chad:     '#5cc8d6', // was cyan-400
  susan:    '#d67ba0', // was pink-400
  arthur:   '#d6c25c', // was yellow-400 (avoid collision with accent)
  leo:      '#a78cd6', // was purple-400
  fern:     '#5cd69b', // was emerald-400
  blake:    '#6ba0d6', // was blue-400
  penny:    '#d69b5c', // was orange-400
  victoria: '#d67b8c', // was rose-400
  dr_chen:  '#8c94d6', // was indigo-400
  luna:     '#c67bd6', // was fuchsia-400
};
export const personaColorList = Object.values(personaColors);
```

## Layout primitives to emit

Emit under `src/components/ui/`:

| Component | Responsibility | Key rules |
|---|---|---|
| `Shell` | 180px sidebar + flex-1 main, `bg-[--color-bg]`, 2px yellow outer border | Sidebar has yellow bottom border under logo, no radius |
| `Sidebar` + `NavItem` | 5px square bullet (filled on active, 1.5px outlined on idle), 11px item label | Active item: yellow fill, black text, no transition |
| `Topbar` | 48px, breadcrumb left + week pill + primary CTA right | CTA = yellow block, 10px weight 700 label |
| `Page` | Display title (weight 900, `-0.05em`), eyebrow line with day/week | Title can wrap via `<br>` for two-line display |
| `KpiGrid` | `grid-cols-4 gap-[2px]`, first cell hero (yellow) | Hero text on yellow uses `#0a0a0a` and `#6b6b00` for muted |
| `KpiCard` | See `examples/kpi-card.tsx` | 18px padding, 36px number, 9px eyebrow |
| `Card` | `bg-[--color-surface] border border-[--color-border] p-[18px]` | Never adds radius or shadow |
| `StatusChip` | `RUNNING` solid yellow-on-black, `LIVE` solid green, `QUEUED` outlined `#333` on `#555`, `PAUSED` outlined `#222` on `#444` | 8px weight 900, `0.08em` tracking |
| `AgentRow` | Grid `2fr 1fr 1fr 1fr 1fr 80px`, yellow name when featured | Hover background `#141414`; featured row uses `#131300` base |
| `LogStrip` | Marquee-like horizontal log ticker, yellow for the live line | Lives under tables (matches reference) |
| `Terminal` | Full-height transcript, mono Geist, yellow caret, `#888` body | Persona names use `personaColors`; system lines yellow |

## Charts (`src/theme/charts.ts` + `src/components/ui/ChartFrame.tsx`)

Export:

```ts
export const chartColors = {
  focal:   'var(--color-accent-2)',   // cyan — primary series
  hero:    'var(--color-accent)',     // yellow — reference lines, axis callouts, not fills
  context: ['#ffffff', '#888888', '#333333', '#1a1a1a'],
  persona: personaColorList,
  grid:    '#1a1a1a',
  axis:    '#444444',
};

export const brutalAxis = {
  stroke: chartColors.axis,
  tick: { fontFamily: 'Geist', fontSize: 9, fill: chartColors.axis, letterSpacing: '0.06em' },
  tickLine: false,
  axisLine: { stroke: chartColors.axis, strokeWidth: 1 },
};

export const brutalGrid = {
  stroke: chartColors.grid,
  strokeDasharray: '1 3',
  vertical: false,
};
```

`<BrutalTooltip>` is a custom recharts `content` component:
- Background `#000`, 1px border `var(--color-accent)` (yellow) — the tooltip is the one place yellow enters charts as chrome, not data.
- 10px Geist, `0.04em` tracking on labels, monospace tabular numerals via `font-variant-numeric: tabular-nums`.
- No radius, no shadow, no arrow.

`<ChartFrame>` wraps each chart:
- Header row: 11px weight 700 title left, 9px uppercase timeframe chip right.
- Body: `bg-[--color-surface] border border-[--color-border] p-[18px]`.
- When `featured` prop is true, add 2px yellow top border (mirrors the Agent Registry header in reference).

### Per-chart rules

- **Bar**: flat fills, no radius, 6-px gap. Hero series uses cyan; siblings use `context` palette in order. If the bar is the "hero of hero" (e.g. primary channel), place a 9px yellow value label above — echoes the reference bar chart. Never give two bars the yellow label.
- **Line / Area**: 2px stroke, `dot={false}` by default, `activeDot` is a 5×5 filled square in the series color. Focal series cyan, others grayscale. Areas use 10% alpha of the stroke color.
- **Scatter (persuasion vs passion — already used in-app)**: `shape="square"` 6×6 markers in persona color; `<ReferenceLine>` at 0 on both axes in yellow (`strokeDasharray="2 2"`, `strokeWidth=1`). This is the one place yellow cohabits with data, because it's axis callout, not a series.
- **Radial / heat (sentiment distribution)**: cyan → grayscale gradient. No persona color here — aggregate-level.
- **Sparklines inline in KPI cards**: 1px stroke, 18px tall, cyan; on a yellow hero KPI card use `#0a0a0a` instead.

## Screen mapping

| Old tab | New screen | Contents |
|---|---|---|
| `simulation` | **Live Run** | Left column: Agent Registry table (personas as agent rows, status chip = per-persona active/queued/paused). Right column: `<Terminal>` streaming the current transcript + top `<LogStrip>` showing the latest 3 system events. Topbar primary CTA: `▶ Run simulation` / `■ Stop`. |
| `products` | **Catalog** | `Card` grid of products. Primary CTA `+ New product` in Topbar. Selected product gets 2px yellow border. |
| `personas` | **Agent Registry** | Full-width `AgentRow` table with toggle (active/inactive) as status chip. |
| `visualization` | **Intelligence** | Top: `KpiGrid` (Avg Sentiment [hero, yellow], Persuasion Index, Passion Index, Agents Active). Grid of `ChartFrame`: (1) Per-persona sentiment Bar, (2) Persuasion vs Passion Scatter, (3) Sentiment over turns Line, (4) Message count per persona stacked Bar. |
| `settings` | **Controls** | Hard-bordered inputs: 1px `--color-border`, no radius, 10px mono label uppercase, yellow focus ring. Sliders use a square thumb + cyan fill track. |

## Motion

`motion` is in deps — use sparingly:
- Status chip state transitions: 120ms opacity + 2px Y-shift when a chip flips state.
- Terminal auto-scroll uses native `scrollTop`, not motion.
- Chart enter: recharts default animations **off** (`isAnimationActive={false}`) so the aesthetic reads as instrumentation, not marketing.

## Accessibility

- Focus ring: `outline: 2px solid var(--color-accent); outline-offset: 2px;` on every interactive element (the reference omits this — we add it, deliberately).
- Interactive elements get a 120ms border-to-yellow hover. Preserve the reference's inline `onmouseenter` pattern only as fallback; prefer Tailwind `hover:` utilities.
- Minimum body text 11px weight 500 on `#0a0a0a` to clear AA contrast with `#888`.

## Execution checklist (when invoked)

1. **Fonts** — add `@fontsource-variable/geist` to `package.json`, import in [src/main.tsx](../../../src/main.tsx):
   ```ts
   import '@fontsource-variable/geist';
   ```
2. **Tokens** — replace [src/index.css](../../../src/index.css) with the `@theme` block above plus base resets (`*{box-sizing:border-box;margin:0;padding:0;}`, `body{font-family:var(--font-sans);background:var(--color-bg);color:var(--color-text);}`).
3. **Extract components** from the monolithic [src/App.tsx](../../../src/App.tsx) into:
   ```
   src/
     theme/
       personas.ts
       charts.ts
     components/ui/
       Shell.tsx  Sidebar.tsx  Topbar.tsx  Page.tsx
       KpiGrid.tsx  KpiCard.tsx  Card.tsx
       StatusChip.tsx  AgentRow.tsx  LogStrip.tsx
       Terminal.tsx  ChartFrame.tsx  BrutalTooltip.tsx
     screens/
       LiveRun.tsx  Catalog.tsx  AgentRegistry.tsx
       Intelligence.tsx  Controls.tsx
   ```
4. **Rewire `App.tsx`** as a thin router over tab state (preserve all current state, refs, and Gemini calls — presentation-only change). Rename tab labels to English.
5. **Translate copy** — all visible strings English. Review persona `prompt` fields in [App.tsx:9](../../../src/App.tsx:9) to confirm English (they already are).
6. **Verify**:
   - `npm run lint` clean.
   - `npm run dev`, open each of the 5 screens in Claude Preview MCP, screenshot, compare side-by-side with `reference.html`.
   - Run a full simulation end-to-end; confirm Terminal streams, Intelligence scatter shows square cyan-free persona markers with yellow reference lines, and `BrutalTooltip` renders on hover.
7. **Do not** add a router library, swap the charts library, change any Gemini prompts, or touch the simulation loop.

## Non-goals

- No backend/API changes.
- No persona-logic changes.
- No new chart library (recharts only).
- No rounded corners, no shadows, no gradients on UI chrome (chart areas may use alpha fills — that's data, not chrome).
- No emojis in UI copy.

## Files at apply-time

Touch: [src/App.tsx](../../../src/App.tsx), [src/index.css](../../../src/index.css), [src/main.tsx](../../../src/main.tsx), [package.json](../../../package.json).
Create: `src/theme/*.ts`, `src/components/ui/*.tsx`, `src/screens/*.tsx`.

## References in this skill folder

- `reference.html` — frozen MKTG/OS mock, the north star.
- `examples/kpi-card.tsx`, `examples/sidebar.tsx`, `examples/agent-row.tsx`, `examples/chart-wrap.tsx` — canonical snippets to copy-and-adapt, not to import directly.
