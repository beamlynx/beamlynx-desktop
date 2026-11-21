export interface ColorTokens {
  '--background-color': string;
  '--text-color': string;
  '--border-color': string;
  '--focus-border-color': string;
  '--text-primary-color': string;
  '--text-warning-color': string;
  '--icon-color': string;
  '--icon-color-highlight': string;
  '--primary-color': string;
  '--primary-color-hover': string;
  '--primary-text-color': string;
  '--notification-color': string;
  '--graph-background': string;
  '--component-border-color': string;
  '--divider-color': string;
  '--node-bg': string;
  '--node-border': string;
  '--node-text-color': string;
  '--node-secondary-text-color': string;
  '--node-handle-bg': string;
  '--node-schema-bg': string;
  '--node-schema-text-color': string;
  '--node-order-bg': string;
  '--node-order-text-color': string;
  '--node-column-bg': string;
  '--node-column-border': string;
  '--node-column-text-color': string;
  '--node-candidate-column-border': string;
  '--node-candidate-column-text-color': string;
  '--node-candidate-container-bg': string;
  '--node-candidate-container-border': string;
  '--node-operation-label-color': string;
  '--node-suggested-bg': string;
  '--node-suggested-border': string;
  '--node-candidate-bg': string;
  '--node-candidate-border': string;
  '--node-candidate-text-color': string;
  '--node-variable-border': string;
  '--node-variable-bg': string;
  '--node-variable-label-color': string;
  '--canvas-bg': string;
  '--canvas-grid-dot': string;
  '--canvas-node-bg': string;
  '--canvas-node-bg-current': string;
  '--canvas-node-border': string;
  '--canvas-node-border-current': string;
  '--canvas-trace': string;
  '--canvas-trace-uncertain': string;
  '--canvas-trace-unresolved': string;
  '--canvas-warn': string;
  '--canvas-pin': string;
  '--canvas-text': string;
  '--canvas-text-dim': string;
  '--canvas-accent-text': string;
  '--canvas-chip-bg': string;
  '--canvas-chip-border': string;
  '--canvas-picker-bg': string;
  '--canvas-picker-border': string;
  '--canvas-container-border': string;
  '--canvas-container-bg': string;
  '--canvas-container-label': string;
}

// Three complete, hand-tuned themes -- not a light/dark toggle crossed with
// a swappable accent. Each is its own coordinated palette (structure +
// interactive color + semantics all chosen together), the same way a real
// editor theme (Tokyo Night, Flexoki, Gruvbox) is one designed whole, not a
// neutral shell with a color bolted on. See styles/palette/themes.ts.
export type ThemeId = 'light' | 'dark' | 'sepia';

// The CodeMirror syntax theme, graph/schema color-coding, and a few other
// pre-existing bits of the app key off a plain light/dark bucket, not the
// specific named theme -- this is what GlobalStore.theme derives to. Kept
// distinct from ThemeId rather than replaced by it, since those call sites
// only ever supported two buckets.
export type Mode = 'light' | 'dark';

export const THEME_MODE: Record<ThemeId, Mode> = {
  light: 'light',
  dark: 'dark',
  // Warm and paper-toned rather than genuinely dark, so it gets the light
  // family's CodeMirror syntax theme and schema colors.
  sepia: 'light',
};
