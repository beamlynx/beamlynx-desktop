export const STORAGE_KEYS = {
  // Holds a ThemeId ('light'|'dark'|'sepia') - the key predates the switch
  // from a plain light/dark toggle to three named themes, kept as-is since
  // 'light'/'dark' are still valid ThemeId values (an existing user's saved
  // preference just carries over as-is).
  THEME: 'pine-theme',
  // Interface (UI chrome) and code (editor/results grid) fonts are
  // independent choices - see styles/fonts.ts.
  UI_FONT_FAMILY: 'pine-ui-font-family',
  CODE_FONT_FAMILY: 'pine-code-font-family',
  TEXT_SIZE: 'pine-text-size',
  VIM_MODE: 'pine-vim-mode',
  PINE_TABLE_COLORS: 'pine-table-colors',
  LAST_READ_VERSION: 'pine-last-read-version',
  COMMAND_HISTORY: 'pine-command-history',
  CONNECTION_COLORS: 'pine-connection-colors',
  SESSIONS: 'pine-sessions',
  AUTO_RUN_ENABLED: 'pine-auto-run-enabled',
  NEW_LAYOUT_ORIENTATION: 'pine-new-layout-orientation',
  NEW_LAYOUT_PANE_WIDTH: 'pine-new-layout-pane-width',
  NEW_LAYOUT_PANE_HEIGHT: 'pine-new-layout-pane-height',
  NEW_LAYOUT_PANEL_VISIBLE: 'pine-new-layout-panel-visible',
  NEW_LAYOUT_PANEL_WIDTH: 'pine-new-layout-panel-width',
  NEW_LAYOUT_PANEL_HEIGHT: 'pine-new-layout-panel-height',
  SETTINGS_PANEL_WIDTH: 'pine-settings-panel-width',
  JSON_PANEL_WIDTH: 'pine-json-panel-width',
  // Which edge the session tab strip runs along (PineTabs.tsx). Named
  // without a NEW_LAYOUT_ prefix on purpose -- unlike the keys above it,
  // this isn't specific to New Layout's own pane arrangement.
  TAB_ORIENTATION: 'pine-tab-orientation',
} as const;

/** Whether a stored value is usable. A value that isn't falls back to the default. */
export type PreferenceCheck = (value: unknown) => boolean;

export const oneOf =
  (values: readonly unknown[]): PreferenceCheck =>
  value =>
    values.includes(value);
export const isBoolean: PreferenceCheck = value => typeof value === 'boolean';
export const isFiniteNumber: PreferenceCheck = value => typeof value === 'number' && Number.isFinite(value);
export const isStringArray: PreferenceCheck = value =>
  Array.isArray(value) && value.every(item => typeof item === 'string');
export const isStringRecord: PreferenceCheck = value =>
  typeof value === 'object' &&
  value !== null &&
  !Array.isArray(value) &&
  Object.values(value).every(item => typeof item === 'string');

let warnedStorageUnavailable = false;
const warnStorageUnavailable = (error: unknown) => {
  if (warnedStorageUnavailable) return;
  warnedStorageUnavailable = true;
  console.warn('Browser storage is unavailable; preferences will not be kept.', error);
};

/**
 * A stored preference, or `defaultValue` when there is none, it isn't JSON,
 * it fails `isValid`, or storage can't be read at all.
 *
 * A value from an older version of the app, or one edited by hand, used to
 * reach the code as is. An unknown theme id threw while rendering, and a
 * blocked localStorage threw while the store was being created. Either one
 * left a blank page. Pass `isValid` for anything that is used as a lookup
 * key or has a fixed type.
 */
export const getUserPreference = <T>(key: string, defaultValue: T, isValid?: PreferenceCheck): T => {
  if (typeof window === 'undefined') {
    return defaultValue;
  }

  let stored: string | null;
  try {
    stored = localStorage.getItem(key);
  } catch (error) {
    // Blocked storage (privacy settings, a sandboxed frame) throws SecurityError.
    warnStorageUnavailable(error);
    return defaultValue;
  }
  if (!stored) return defaultValue;

  let value: unknown;
  try {
    value = JSON.parse(stored);
  } catch {
    return defaultValue;
  }
  if (isValid && !isValid(value)) {
    console.warn(`Ignoring stored preference ${key}: unexpected value`, value);
    return defaultValue;
  }
  return value as T;
};

export const setUserPreference = (key: string, value: any) => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    // Blocked storage, or the quota is full. The preference is lost; the
    // app keeps working.
    warnStorageUnavailable(error);
  }
};

/** Removes every stored preference except the open tabs. Used by AppErrorBoundary. */
export const resetPreferences = () => {
  for (const key of Object.values(STORAGE_KEYS)) {
    if (key === STORAGE_KEYS.SESSIONS) continue;
    try {
      localStorage.removeItem(key);
    } catch (error) {
      warnStorageUnavailable(error);
    }
  }
};
