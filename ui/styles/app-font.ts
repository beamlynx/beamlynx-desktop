import { IBM_Plex_Mono, IBM_Plex_Sans, JetBrains_Mono, Fira_Code, Inter } from 'next/font/google';
import { UiFontId, CodeFontId } from './fonts';

// Self-hosted via next/font (bundled at build time, no runtime request) -
// see the file-level comment history this replaced for why. 'system' and
// 'system-mono' need no loader at all - they're plain CSS font stacks,
// which also makes them the only two choices that render identically on
// the desktop build (see app-font.desktop.ts).
//
// The desktop build never actually loads this file - see app-font.desktop.ts
// for why (next/font can't compile under its relative assetPrefix) and what
// it substitutes instead.
const interFont = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-inter',
  display: 'swap',
});

const plexSans = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-plex-sans',
  display: 'swap',
});

const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-plex-mono',
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-jetbrains-mono',
  display: 'swap',
});

const firaCode = Fira_Code({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-fira-code',
  display: 'swap',
});

const SYSTEM_UI_STACK = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, sans-serif';
const SYSTEM_MONO_STACK = 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace';

// Reading `.style.fontFamily` off each font object (rather than hardcoding
// the family name we passed to next/font) gets the exact usable CSS value
// next/font generated, fallback stack included.
export const UI_FONT_FAMILIES: Record<UiFontId, { fontFamily: string }> = {
  system: { fontFamily: SYSTEM_UI_STACK },
  inter: { fontFamily: interFont.style.fontFamily },
  'plex-sans': { fontFamily: plexSans.style.fontFamily },
};

export const CODE_FONT_FAMILIES: Record<CodeFontId, { fontFamily: string }> = {
  'plex-mono': { fontFamily: plexMono.style.fontFamily },
  'jetbrains-mono': { fontFamily: jetbrainsMono.style.fontFamily },
  'fira-code': { fontFamily: firaCode.style.fontFamily },
  'system-mono': { fontFamily: SYSTEM_MONO_STACK },
};

// Applied once, high up the tree (pages/index.tsx's AppContent and
// canvas/Canvas.tsx), so next/font actually bundles/preloads every font
// regardless of which ones are selected at runtime.
export const appFontVariablesClassName = [
  interFont.variable,
  plexSans.variable,
  plexMono.variable,
  jetbrainsMono.variable,
  firaCode.variable,
].join(' ');
