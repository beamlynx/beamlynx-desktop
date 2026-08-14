// Desktop build's stand-in for app-font.ts - webpack-aliased in by
// next.config.js instead of the real file, which next/font can't compile
// under the desktop build's relative `assetPrefix` (see app-font.ts's own
// comment for why). `.canvas-font-fallback` (styles/globals.css) defines
// the real --canvas-font variable, just pointing at a generic monospace
// stack instead of the self-hosted IBM Plex Mono the hosted build gets -
// purely cosmetic, nothing reads --canvas-font expecting this exact
// typeface, only *a* monospace one.
export const appFont = { variable: 'canvas-font-fallback' };
