import { ColorTokens, ThemeId } from './tokens';
import { THEMES } from './themes';

export const buildColorTokens = (themeId: ThemeId): ColorTokens => THEMES[themeId];

// Settings-UI metadata -- swatch colors are read live via buildColorTokens
// rather than duplicated here, so a palette tweak can't drift out of sync
// with its preview.
export const THEME_LIST: { id: ThemeId; label: string; description: string }[] = [
  { id: 'light', label: 'Light', description: 'Warm paper, inspired by Flexoki.' },
  { id: 'dark', label: 'Dark', description: 'Cool blue-purple, inspired by Tokyo Night.' },
  { id: 'sepia', label: 'Sepia', description: 'Warm reading mode, terracotta accent.' },
];
