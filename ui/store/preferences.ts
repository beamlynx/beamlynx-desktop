export const STORAGE_KEYS = {
  SIDEBAR_WIDTH: 'pine-sidebar-width',
  SIDEBAR_SECOND_VIEW_HEIGHT: 'pine-sidebar-second-view-height',
  THEME: 'pine-theme',
  VIM_MODE: 'pine-vim-mode',
  FORCE_COMPACT_MODE: 'pine-force-compact-mode',
  PINE_TABLE_COLORS: 'pine-table-colors',
  LAST_READ_VERSION: 'pine-last-read-version',
  COMMAND_HISTORY: 'pine-command-history',
  CONNECTION_COLORS: 'pine-connection-colors',
  SESSIONS: 'pine-sessions',
  CANVAS_MODE: 'pine-canvas-mode',
  AUTO_RUN_ENABLED: 'pine-auto-run-enabled',
  LAYOUT_MODE: 'pine-layout-mode',
  NEW_LAYOUT_ORIENTATION: 'pine-new-layout-orientation',
  NEW_LAYOUT_PANE_WIDTH: 'pine-new-layout-pane-width',
  NEW_LAYOUT_PANE_HEIGHT: 'pine-new-layout-pane-height',
  NEW_LAYOUT_PANEL_VISIBLE: 'pine-new-layout-panel-visible',
} as const;

export const getUserPreference = (key: string, defaultValue: any) => {
  if (typeof window === 'undefined') {
    console.log(`Using default value ${defaultValue} for preference ${key}`);
    return defaultValue;
  }

  const stored = localStorage.getItem(key);
  if (!stored) return defaultValue;

  try {
    return JSON.parse(stored);
  } catch {
    return defaultValue;
  }
};

export const setUserPreference = (key: string, value: any) => {
  if (typeof window === 'undefined') return;
  localStorage.setItem(key, JSON.stringify(value));
};
