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

/* New Layout's one shared spacing unit: the gap above/below the pane row
 * (NewLayoutView.tsx) and the width/height of the resizable divider between
 * the two panes (ResizableDividers.tsx) all use this same value, so the
 * "space between the panes" and the "space around them" read as one
 * consistent gap instead of independently-guessed numbers that happen to be
 * close (previously 10px for the divider vs. 8px - MUI's theme.spacing(1) -
 * for the surrounding margin). Matches AppView.tsx's own `m: 1` left/right
 * inset around the tab region, so all four sides plus the pane divider end
 * up the same. */
export const NEW_LAYOUT_GUTTER = 8;

/* New Layout's Pine/SQL panel sizing - separate from the pane sizing above,
 * which governs the Canvas|Results split; this one governs the panel next
 * to (or below) Canvas, a smaller, secondary widget. */
export const DEFAULT_NEW_LAYOUT_PANEL_WIDTH = 340;
export const DEFAULT_NEW_LAYOUT_PANEL_HEIGHT = 220;
export const MIN_NEW_LAYOUT_PANEL_SIZE = 160;

/* New Layout's docked Settings panel - a third sibling alongside the
 * Canvas|Results split (NewLayoutView.tsx), not part of it, so it gets its
 * own sizing rather than reusing the pane/panel constants above. Wide enough
 * by default for the 210px rail plus a readable content column. */
export const DEFAULT_SETTINGS_PANEL_WIDTH = 640;
export const MIN_SETTINGS_PANEL_WIDTH = 420;

/* Vertical tab rail (PineTabs.tsx, Appearance -> Tabs = Vertical). Fixed,
 * not resizable: the rail only ever holds session names, so there's no
 * content whose size would justify a drag handle -- and every other
 * resizable boundary in the app separates two panes that both compete for
 * the same space, which this doesn't. Wide enough for a typical session
 * name plus its connection dot and close button; longer names ellipsize. */
export const VERTICAL_TAB_RAIL_WIDTH = 190;

/* Pine Server */
export const RequiredVersion = '0.43.0';

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
