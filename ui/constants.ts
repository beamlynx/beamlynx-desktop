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

/* Pine Server */
export const RequiredVersion = '0.29.0';

/* Layout Constants */
// Height calculations for main content areas
// These account for header, margins, and other UI elements
export const LAYOUT_HEIGHTS = {
  DEFAULT_MODE_OFFSET: 112,
  COMPACT_MODE_OFFSET: 300,
} as const;

export const getTabHeight = () => `calc(100vh - ${LAYOUT_HEIGHTS.DEFAULT_MODE_OFFSET}px)`;
export const getSecondaryViewHeight = () => `calc(100vh - ${LAYOUT_HEIGHTS.COMPACT_MODE_OFFSET}px)`;
