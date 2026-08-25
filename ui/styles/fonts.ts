// Font choice metadata shared by the store and the settings UI. Actual font
// loading (self-hosted via next/font on web, system-font stacks on desktop)
// lives in app-font.ts / app-font.desktop.ts - see those for why the two
// builds need different mechanisms.
//
// Two independent axes, not one shared list - the app's UI chrome (buttons,
// labels, headers, canvas node text) and its code surfaces (the query
// editor, results grid, where monospace alignment actually matters) have
// different typographic needs. Using one monospace-only list for both used
// to mean choosing a coding font for a settings button label, which is not
// how any polished app's typography works, and made the choices feel
// interchangeable (all monospace fonts are deliberately similar to each
// other - the real differences show up in code, not UI chrome).
export type UiFontId = 'system' | 'inter' | 'plex-sans';
export type CodeFontId = 'plex-mono' | 'jetbrains-mono' | 'fira-code' | 'system-mono';

export const UI_FONTS: { id: UiFontId; label: string }[] = [
  { id: 'system', label: 'System' },
  { id: 'inter', label: 'Inter' },
  { id: 'plex-sans', label: 'IBM Plex Sans' },
];

export const CODE_FONTS: { id: CodeFontId; label: string }[] = [
  { id: 'plex-mono', label: 'IBM Plex Mono' },
  { id: 'jetbrains-mono', label: 'JetBrains Mono' },
  { id: 'fira-code', label: 'Fira Code' },
  { id: 'system-mono', label: 'System Monospace' },
];
