// The base/shared tokens below (background, text, border, primary, node-*)
// used to hold their own generic dark-IDE palette, independent of canvas
// mode's "schematic/blueprint" identity (--canvas-* further down) - meaning
// only canvas mode had a real designed identity, and everything else (the
// results grid, editors, tabs, the classic graph, modals, command palette)
// still looked like a generic MUI dark theme. They're now literal duplicates
// of the matching --canvas-* values, so the entire app shares one palette
// from a single conceptual source of truth (--canvas-* below).
//
// Literal duplicates, not `var(--canvas-*)` references: styles/theme.ts reads
// a handful of these (`--primary-color`, `--background-color`, `--node-
// column-bg`, `--text-color`, `--node-secondary-text-color`) back as plain JS
// strings to build MUI's palette, and MUI's `createTheme` runs actual color
// math on `palette.primary.main` (via `augmentColor`/`darken`/`lighten`) to
// derive `light`/`dark`/`contrastText` - confirmed live that a `var(...)`
// string there throws ("MUI: Unsupported `var(--canvas-trace)` color") since
// that math needs a real parseable color, not a CSS custom property
// reference resolved later by the browser. Every token below is therefore
// safe to read from either JS or CSS.
//
// Tokens with their own real distinct meaning (--node-candidate-*/--node-
// suggested-*/--node-variable-* - the classic graph's suggestion/candidate/
// checkpoint states) keep their own values, updated to *fit* the blueprint
// palette rather than clash with it.
export const lightColors = {
  '--background-color': '#eef4fa',
  '--text-color': '#0f2337',
  '--border-color': '#9fc0dc',
  '--focus-border-color': '#1c6fa8',
  '--text-primary-color': '#0f2337',
  '--text-warning-color': '#c1484c',
  '--icon-color': '#4d6d85',
  '--icon-color-highlight': '#4caf50',
  '--primary-color': '#1c6fa8',
  '--primary-color-hover': '#1c6fa8',
  '--primary-text-color': '#ffffff',
  '--notification-color': '#c97a12',
  '--graph-background': '#eef4fa',
  '--component-border-color': '#9fc0dc',
  '--divider-color': '#9fc0dc',
  '--node-bg': '#ffffff',
  '--node-border': '#9fc0dc',
  '--node-text-color': '#0f2337',
  '--node-secondary-text-color': '#4d6d85',
  '--node-handle-bg': '#5c86a8',
  '--node-schema-bg': '#e3edf6',
  '--node-schema-text-color': '#0f2337',
  '--node-order-bg': '#1c6fa8',
  '--node-order-text-color': '#ffffff',
  '--node-column-bg': '#e3edf6',
  '--node-column-border': '#b7d0e4',
  '--node-column-text-color': '#0f2337',
  '--node-candidate-column-border': '#c97a12',
  '--node-candidate-column-text-color': '#4d6d85',
  '--node-candidate-container-bg': 'transparent',
  '--node-candidate-container-border': '#9fc0dc',
  '--node-operation-label-color': '#4d6d85',
  '--node-suggested-bg': '#ffffff',
  '--node-suggested-border': '#9fc0dc',
  '--node-candidate-bg': '#dbeeff',
  '--node-candidate-border': '#1c6fa8',
  '--node-candidate-text-color': '#0f2337',
  // The classic graph's checkpoint/variable (`|=`) nodes - a genuinely
  // distinct concept (a saved reference, not a table), so it keeps its own
  // accent rather than blending into the trace/cyan language everywhere
  // else, the same way canvas mode keeps destructive red separate from its
  // accent cyan. Previously undefined here entirely - VariableNodeComponent
  // referenced these exact var() names with inline fallback defaults
  // (`var(--node-variable-border, #7c5cbf)`), so both themes silently used
  // the same hardcoded violet regardless of light/dark.
  '--node-variable-border': '#7c5cbf',
  '--node-variable-bg': 'rgba(124, 92, 191, 0.08)',
  '--node-variable-label-color': '#5b3f99',

  // Canvas mode's own palette ("schematic/blueprint" - see the plan doc's
  // follow-up pass 7), now the app's shared identity (follow-up pass 10) -
  // every token above is a literal duplicate of the matching value here (see
  // the file-level comment for why duplicates rather than var() references).
  '--canvas-bg': '#eef4fa',
  '--canvas-grid-dot': '#c8dced',
  '--canvas-node-bg': '#ffffff',
  '--canvas-node-bg-current': '#dbeeff',
  '--canvas-node-border': '#9fc0dc',
  '--canvas-node-border-current': '#1c6fa8',
  '--canvas-trace': '#1c6fa8',
  '--canvas-trace-uncertain': '#6a93ad',
  '--canvas-trace-unresolved': '#c97a12',
  '--canvas-warn': '#c1484c',
  '--canvas-pin': '#5c86a8',
  '--canvas-text': '#0f2337',
  '--canvas-text-dim': '#4d6d85',
  '--canvas-accent-text': '#ffffff',
  '--canvas-chip-bg': '#e3edf6',
  '--canvas-chip-border': '#b7d0e4',
  '--canvas-picker-bg': '#ffffff',
  '--canvas-picker-border': '#9fc0dc',
};

export const darkColors = {
  '--background-color': '#0a1826',
  '--text-color': '#dbeeff',
  '--border-color': '#2c5578',
  '--focus-border-color': '#4fd1ff',
  '--text-primary-color': '#dbeeff',
  '--text-warning-color': '#e0575b',
  '--icon-color': '#7ba3c2',
  '--icon-color-highlight': '#98c379',
  '--primary-color': '#4fd1ff',
  '--primary-color-hover': '#4fd1ff',
  '--primary-text-color': '#0a1826',
  '--notification-color': '#f5a623',
  '--graph-background': '#0a1826',
  '--component-border-color': '#2c5578',
  '--divider-color': '#2c5578',
  '--node-bg': '#0f2337',
  '--node-border': '#2c5578',
  '--node-text-color': '#dbeeff',
  '--node-secondary-text-color': '#7ba3c2',
  '--node-handle-bg': '#5c86a8',
  '--node-schema-bg': '#132a41',
  '--node-schema-text-color': '#dbeeff',
  '--node-order-bg': '#4fd1ff',
  '--node-order-text-color': '#0a1826',
  '--node-column-bg': '#132a41',
  '--node-column-border': '#28577c',
  '--node-column-text-color': '#dbeeff',
  '--node-candidate-column-border': '#f5a623',
  '--node-candidate-column-text-color': '#7ba3c2',
  '--node-candidate-container-bg': 'transparent',
  '--node-candidate-container-border': '#2c5578',
  '--node-operation-label-color': '#7ba3c2',
  '--node-suggested-bg': '#0f2337',
  '--node-suggested-border': '#2c5578',
  '--node-candidate-bg': '#123554',
  '--node-candidate-border': '#4fd1ff',
  '--node-candidate-text-color': '#dbeeff',
  '--node-variable-border': '#9b7fd4',
  '--node-variable-bg': 'rgba(155, 127, 212, 0.12)',
  '--node-variable-label-color': '#c3aef0',

  // Canvas mode's own palette ("schematic/blueprint") - see the light
  // palette's matching comment above.
  '--canvas-bg': '#0a1826',
  '--canvas-grid-dot': '#1c3b57',
  '--canvas-node-bg': '#0f2337',
  '--canvas-node-bg-current': '#123554',
  '--canvas-node-border': '#2c5578',
  '--canvas-node-border-current': '#4fd1ff',
  '--canvas-trace': '#4fd1ff',
  '--canvas-trace-uncertain': '#7fb8d6',
  '--canvas-trace-unresolved': '#f5a623',
  '--canvas-warn': '#e0575b',
  '--canvas-pin': '#5c86a8',
  '--canvas-text': '#dbeeff',
  '--canvas-text-dim': '#7ba3c2',
  '--canvas-accent-text': '#0a1826',
  '--canvas-chip-bg': '#132a41',
  '--canvas-chip-border': '#28577c',
  '--canvas-picker-bg': '#0f2337',
  '--canvas-picker-border': '#2c5578',
};
