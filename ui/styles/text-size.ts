export type TextSize = 'small' | 'medium' | 'large';

// A single control, not the earlier Zoom/Font-size split. That split still
// left two things that each did too little: Zoom was implemented as CSS
// `zoom` on <html>, which is literally the same mechanism as a browser's
// Ctrl/Cmd +/- - it scales the whole rendered pixel surface as one unit,
// including the resizable canvas/pine-panel split, which is exactly what a
// user does NOT want from an in-app text setting (reported directly: "the
// balance gets zoomed in too... there shouldn't be a global scrollbar").
// Font size, meanwhile, only reached a handful of calc() call sites and
// read as "a very minor modification".
//
// This scale drives three things, all in pages/_app.tsx:
//   1. MUI's own theme.typography.fontSize and theme.spacing (see
//      styles/theme.ts's createAppTheme) - covers default MUI Typography
//      variants and anything sized via theme.spacing().
//   2. The root <html> font-size (as a %) - covers plain 'Nrem' literals
//      scattered through this codebase's sx/style objects, which don't
//      respond to (1) since rem is relative to the root, not to MUI's
//      internal typography.fontSize base.
//   3. --text-scale, a CSS var for the literal 'Npx' sites that opted in via
//      calc(<px> * var(--text-scale, 1)) - mainly the query editor and
//      results grid, where alignment/density matters enough to be explicit
//      rather than left to (1)/(2).
// Resizable panel widths and the canvas are stored as literal pixel state
// untouched by any of the three, so the panel balance and canvas geometry
// stay put - only the content's own text/spacing grows. This is also why
// it's a scale factor and not CSS `zoom`: zoom would touch that pixel state
// too (see the git history of this file for the report that prompted the
// change - a prior "Zoom" setting behaved just like a browser's Ctrl/Cmd
// +/-, which scaled the resizable panel split along with everything else).
export const TEXT_SIZE_SCALE: Record<TextSize, number> = {
  small: 0.85,
  medium: 1,
  large: 1.25,
};

export const TEXT_SIZE_LABELS: Record<TextSize, string> = {
  small: 'Small',
  medium: 'Medium',
  large: 'Large',
};
