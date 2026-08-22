/* DB Connection Monitor Constants */
export const TOTAL_BARS = 100;
export const MAX_COUNT = 300;

/* Sidebar Width */
export const DEFAULT_SIDEBAR_WIDTH = 400;
export const MIN_SIDEBAR_WIDTH = 200;

/* Sidebar input area - minimum height so it cannot be resized to zero */
export const MIN_SIDEBAR_INPUT_HEIGHT = 100;

/* Sidebar second view (Query / Graph / Error) height - resizable vertically */
export const DEFAULT_SIDEBAR_SECOND_VIEW_HEIGHT = 280;
export const MIN_SIDEBAR_SECOND_VIEW_HEIGHT = 120;
export const MAX_SIDEBAR_SECOND_VIEW_HEIGHT = 800;

/* New Layout (Canvas + Results) pane sizing - unrelated to the sidebar's own
 * constants above, since the two layouts' pane proportions have nothing to
 * do with each other. */
export const DEFAULT_NEW_LAYOUT_PANE_WIDTH = 640;
export const DEFAULT_NEW_LAYOUT_PANE_HEIGHT = 420;
export const MIN_NEW_LAYOUT_PANE_SIZE = 240;

/* Pine Server */
export const RequiredVersion = '0.39.0';

/* Layout Constants */
// Height calculations for main content areas
// These account for header, margins, and other UI elements
export const LAYOUT_HEIGHTS = {
  // +8px each (the tab row's new `mt: 1` in AppView.tsx, added once the tab
  // row itself gained a solid background and needed visual separation from
  // the header row above it - see the plan doc's follow-up pass 12).
  // Without this, the app's actual total height grew by that same 8px
  // while these calc(100vh - Npx) heights stayed put, overflowing the
  // viewport by exactly 8px and forcing a whole-page scrollbar.
  DEFAULT_MODE_OFFSET: 120,
  COMPACT_MODE_OFFSET: 308,
} as const;

export const getTabHeight = () => `calc(100vh - ${LAYOUT_HEIGHTS.DEFAULT_MODE_OFFSET}px)`;
export const getSecondaryViewHeight = () => `calc(100vh - ${LAYOUT_HEIGHTS.COMPACT_MODE_OFFSET}px)`;
