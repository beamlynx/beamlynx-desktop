import { IBM_Plex_Mono } from 'next/font/google';

// Canvas mode's signature type: IBM Plex Mono was drawn for technical/
// engineering documentation, which is exactly the register the schematic
// redesign is going for - a deliberate upgrade from the generic 'Courier'
// stack canvas mode used before, not a new idea (canvas already used
// monospace throughout to echo the Pine/SQL text it represents).
// Self-hosted via next/font (bundled at build time, no runtime request) and
// scoped to canvas mode only via the `variable` CSS custom property - see
// its `.variable` class applied on Canvas.tsx's root.
export const canvasFont = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--canvas-font',
  display: 'swap',
});
