import { UiFontId, CodeFontId } from './fonts';

// The CSS font stack for each font choice. The fonts themselves ship inside
// the app: pages/_app.tsx imports their @font-face rules and files from the
// @fontsource packages, so the hosted app, the desktop app and `beam dev`
// all draw the same fonts with no network request, at build time or at run
// time. scripts/check-bundle-assets.mjs fails the build if any of them goes
// missing from the output.
//
// 'system' and 'system-mono' load nothing: they are the operating system's
// own fonts, by design.

const SYSTEM_UI_STACK = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, sans-serif';
const SYSTEM_MONO_STACK = 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace';

export const UI_FONT_FAMILIES: Record<UiFontId, { fontFamily: string }> = {
  system: { fontFamily: SYSTEM_UI_STACK },
  inter: { fontFamily: `"Inter", ${SYSTEM_UI_STACK}` },
  'plex-sans': { fontFamily: `"IBM Plex Sans", ${SYSTEM_UI_STACK}` },
};

export const CODE_FONT_FAMILIES: Record<CodeFontId, { fontFamily: string }> = {
  'plex-mono': { fontFamily: `"IBM Plex Mono", ${SYSTEM_MONO_STACK}` },
  'jetbrains-mono': { fontFamily: `"JetBrains Mono", ${SYSTEM_MONO_STACK}` },
  'fira-code': { fontFamily: `"Fira Code", ${SYSTEM_MONO_STACK}` },
  'system-mono': { fontFamily: SYSTEM_MONO_STACK },
};

/**
 * The families the app bundles, and the weights it uses of each. The build
 * check reads this list, so a font added here without its @font-face rules
 * fails the build rather than quietly falling back.
 */
export const BUNDLED_FONTS: { family: string; weights: number[] }[] = [
  { family: 'Inter', weights: [400, 500, 600, 700] },
  { family: 'IBM Plex Sans', weights: [400, 500, 600, 700] },
  { family: 'IBM Plex Mono', weights: [400, 500, 600, 700] },
  { family: 'JetBrains Mono', weights: [400, 500, 600, 700] },
  { family: 'Fira Code', weights: [400, 500, 600, 700] },
];
