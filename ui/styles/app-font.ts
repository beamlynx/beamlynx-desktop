import { IBM_Plex_Mono } from 'next/font/google';

// The app's signature type - IBM Plex Mono was drawn for technical/
// engineering documentation, matching the "schematic/blueprint" identity
// (originally built for canvas mode, then extended to the results grid,
// editors, and tabs - see the plan doc's follow-up passes). A deliberate
// upgrade from generic monospace stacks, not a new idea - the editor/results
// already leaned on monospace for the same reason canvas mode did: it's
// literally showing Pine/SQL/tabular data.
// Self-hosted via next/font (bundled at build time, no runtime request).
// The CSS variable it defines (--canvas-font) is applied once, high up the
// tree (pages/index.tsx's AppContent), so every component below can read
// `var(--canvas-font)` regardless of whether it's inside canvas mode's own
// DOM subtree - kept as `--canvas-font` (not renamed to something app-
// generic) purely to avoid a second mechanical rename across every canvas
// component that already reads it.
export const appFont = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--canvas-font',
  display: 'swap',
});
