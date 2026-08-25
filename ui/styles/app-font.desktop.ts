import { UiFontId, CodeFontId } from './fonts';

// Desktop build's stand-in for app-font.ts - webpack-aliased in by
// next.config.js instead of the real file, which next/font can't compile
// under the desktop build's relative `assetPrefix` (see app-font.ts's own
// comment for why). No self-hosted font files here, just system-font
// stacks naming the real typeface first (in case the user has it
// installed) with a generic fallback - 'system'/'system-mono' render
// identically to the web build (they were never a webfont to begin with),
// everything else is an approximation, same as the original single-font
// fallback this replaced.
export const UI_FONT_FAMILIES: Record<UiFontId, { fontFamily: string }> = {
  system: { fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, sans-serif' },
  inter: { fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' },
  'plex-sans': { fontFamily: '"IBM Plex Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' },
};

export const CODE_FONT_FAMILIES: Record<CodeFontId, { fontFamily: string }> = {
  'plex-mono': { fontFamily: '"IBM Plex Mono", ui-monospace, Menlo, Consolas, "Liberation Mono", monospace' },
  'jetbrains-mono': { fontFamily: '"JetBrains Mono", ui-monospace, Menlo, Consolas, monospace' },
  'fira-code': { fontFamily: '"Fira Code", ui-monospace, Menlo, Consolas, monospace' },
  'system-mono': { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace' },
};

export const appFontVariablesClassName = 'canvas-font-fallback';
