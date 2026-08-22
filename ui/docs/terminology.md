# Terminology: layouts and graph modes

Two separate choices control what the app looks like. Mixing them up is an
easy mistake, since both are toggled from similar-looking switches — this
page exists so future copy and code stay consistent.

## Layout: New Layout vs. Legacy Layout

The **layout** is the overall page arrangement — which panels exist and
where they sit. `GlobalStore.layoutMode` (`'new' | 'legacy'`), default `'new'`.

- **New Layout** — Canvas mode on the left/top, Results on the right/bottom,
  orientation configurable. This is the default for everyone. It has no
  Graph mode option; Canvas is its only graph editor. See
  `components/NewLayoutView.tsx`.
- **Legacy Layout** — the original sidebar arrangement (Pine/SQL input,
  a resizable secondary panel, a large graph/results panel). Kept around so
  people who started on it aren't forced off it. See `components/Session.tsx`.

Switch between them via the small text link in the header (New Layout only —
Legacy Layout has no equivalent prominent switcher, reach it via Settings or
the command palette's "Toggle Layout" command), Settings, or the
`toggle-layout-mode` command.

## Graph mode: Canvas mode vs. Graph mode

The **graph mode** is which graph editor renders. `GlobalStore.canvasModeEnabled`
(boolean), default off. This choice only matters inside Legacy Layout — New
Layout always uses Canvas mode and has no switcher for it.

- **Canvas mode** — the point-and-click editor. Every click, pick, or
  chip-remove directly edits the underlying Pine expression; there's no
  separate "apply" step. Component: `components/canvas/Canvas.tsx`. Full
  writeup: [canvas-mode.md](./canvas-mode.md).
- **Graph mode** — the original, read-only diagram. It visualizes whatever's
  already been typed into the text input; it doesn't let you build a query by
  clicking. Component: `components/Graph.box.tsx`. Node-state vocabulary:
  [classic-graph-node-types.md](./classic-graph-node-types.md) (that doc
  predates this naming pass and still says "classic graph" throughout — same
  thing as "Graph mode" here).

In Legacy Layout, switch between the two via the header pill
(`components/AppView.tsx`'s `InteractiveViewToggle`), Settings, or the
`toggle-canvas` command.

## How the two combine

|                | Legacy Layout                          | New Layout        |
|----------------|-----------------------------------------|--------------------|
| Graph mode     | available (the default within Legacy)   | not available      |
| Canvas mode    | available, toggled on                   | always on          |

There's no "Graph mode inside New Layout" — New Layout was built around
Canvas mode's always-valid-expression guarantee (every commit is
backend-confirmed before it's applied — see canvas-mode.md's "Why"), which
Graph mode's plain text-typing input doesn't provide.
