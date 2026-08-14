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
//
// The desktop build never actually loads this file - next.config.js
// webpack-aliases this exact module path to app-font.desktop.ts instead,
// because next/font validates `assetPrefix` at build time and rejects
// anything that isn't a leading-slash path or an absolute URL. The desktop
// build sets `assetPrefix: './'` (relative, so file://-loaded assets
// resolve correctly), which trips that check and fails `next build`
// outright the moment webpack so much as parses a next/font call - not
// something a runtime/conditional check inside this file can work around,
// since next/font's own compiler plugin requires "Font loaders must be
// called and assigned to a const in module scope", i.e. unconditionally.
// See app-font.desktop.ts for the substitute this file never gets to run.
export const appFont = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--canvas-font',
  display: 'swap',
});
