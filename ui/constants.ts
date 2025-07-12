/* DB Connection Monitor Constants */
export const TOTAL_BARS = 100;
export const MAX_COUNT = 300;

/* Sidebar Width */
export const DEFAULT_SIDEBAR_WIDTH = 240;
export const MIN_SIDEBAR_WIDTH = 200;

/* Pine Server */
export const RequiredVersion = '0.22.0';

/* Layout Constants */
// Height calculations for main content areas
// These account for header, margins, and other UI elements
export const LAYOUT_HEIGHTS = {
  DEFAULT_MODE_OFFSET: 122,
  COMPACT_MODE_OFFSET: 326,
} as const;

export const getDefaultModeHeight = () => `calc(100vh - ${LAYOUT_HEIGHTS.DEFAULT_MODE_OFFSET}px)`;
export const getCompactModeHeight = () => `calc(100vh - ${LAYOUT_HEIGHTS.COMPACT_MODE_OFFSET}px)`;
