import type { SxProps, Theme } from '@mui/material';

/**
 * The app's scrollbar, for any scrollable box that isn't the results grid.
 *
 * The OS default scrollbar ignores the theme entirely, which reads as a hole
 * punched in a themed surface -- most visible on the dark themes, where a
 * light system scrollbar sits inside a dark panel.
 *
 * These exact tokens were already repeated in ChangelogModal, CommandPalette,
 * JsonInspectorPanel and the CodeMirror theme (editor-theme.ts, which has to
 * spell them out itself since it styles `.cm-scroller`, not an MUI `sx`).
 * Collected here so a new scrollable surface has one obvious thing to reach
 * for rather than a choice of four places to copy from. The existing copies
 * are left alone -- they are correct, and churning them would bury a real
 * change in a reformat.
 *
 * Firefox ignores `::-webkit-scrollbar` and takes `scrollbar-width` /
 * `scrollbar-color` instead, so both are set.
 */
export const themedScrollbarSx: SxProps<Theme> = {
  scrollbarWidth: 'thin',
  scrollbarColor: 'var(--border-color) transparent',
  '&::-webkit-scrollbar': {
    width: '8px',
    height: '8px',
  },
  '&::-webkit-scrollbar-track': {
    background: 'transparent',
  },
  '&::-webkit-scrollbar-thumb': {
    background: 'var(--border-color)',
    borderRadius: '4px',
  },
  '&::-webkit-scrollbar-thumb:hover': {
    background: 'var(--text-color)',
    opacity: 0.5,
  },
};
