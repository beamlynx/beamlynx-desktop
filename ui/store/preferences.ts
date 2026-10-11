import type { AppDbStartupState, BeamlynxDesktopApi } from '../desktop';

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
  // Whether the SQL panel shows the columns pine-lang adds for editing.
  SHOW_HIDDEN_SQL_COLUMNS: 'pine-show-hidden-sql-columns',
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
 * On desktop, preferences live in the app's SQLite file (beamlynx-desktop's
 * app-db.ts), shared by the installed app and a dev build. Stores read them
 * synchronously while they are built, so the first read loads every
 * preference in one blocking call into `cache`, and every read after that
 * comes from it. Writes update the cache at once and reach the file in
 * batches, so dragging a panel edge doesn't write on every pixel.
 *
 * localStorage keeps getting every write for now, so going back to a
 * release without this still finds current settings. The web build, an
 * older desktop app, and a file that won't open use localStorage alone.
 */
type DesktopPreferences = {
  appDb: NonNullable<BeamlynxDesktopApi['appDb']>;
  cache: Map<string, string>;
  // Changes not yet sent to the file. A null value deletes the key.
  pending: Map<string, string | null>;
  flushTimer: ReturnType<typeof setTimeout> | null;
};

const FLUSH_DELAY_MS = 300;

// undefined until the first read or write decides; null means localStorage.
let desktopPreferences: DesktopPreferences | null | undefined;

/** Forgets which backend was chosen, so a test can choose again. */
export const resetPreferenceBackendForTests = () => {
  desktopPreferences = undefined;
};

const getDesktopPreferences = (): DesktopPreferences | null => {
  if (desktopPreferences !== undefined) return desktopPreferences;
  desktopPreferences = null;

  const desktop = window.beamlynxDesktop;
  const appDb = desktop?.appDb;
  if (!desktop || !appDb?.loadStartupState) return null;
  let state: AppDbStartupState;
  try {
    state = appDb.loadStartupState();
  } catch (error) {
    console.warn('Could not load preferences from the app data file; using browser storage.', error);
    return null;
  }
  if (!state.ok) {
    console.warn(`Could not load preferences from the app data file; using browser storage. ${state.reason}`);
    return null;
  }

  const prefs: DesktopPreferences = {
    appDb,
    cache: new Map(Object.entries(state.preferences)),
    pending: new Map(),
    flushTimer: null,
  };
  if (!state.status.importedFromLocalStorage) importFromLocalStorage(prefs, desktop.isDevBuild);
  window.addEventListener('pagehide', () => void flushPreferences());
  desktopPreferences = prefs;
  return prefs;
};

/**
 * Brings the settings from before SQLite into the file, once per file. Only
 * keys the file doesn't have yet are taken, so nothing in it is overwritten.
 *
 * A dev build has its own localStorage, apart from the installed app's, but
 * shares the file. If it imported, it would mark the file done with its own
 * settings, and the installed app would never bring in the real ones. So a
 * dev build only shows its old settings, without writing them or the marker.
 */
const importFromLocalStorage = (prefs: DesktopPreferences, isDevBuild: boolean) => {
  const changes: Record<string, string> = {};
  for (const key of Object.values(STORAGE_KEYS)) {
    if (prefs.cache.has(key)) continue;
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(key);
    } catch (error) {
      warnStorageUnavailable(error);
    }
    if (stored === null) continue;
    prefs.cache.set(key, stored);
    changes[key] = stored;
  }
  if (isDevBuild) return;
  // The marker goes in only after the values are safely written.
  prefs.appDb
    .setPreferences(changes)
    .then(() => prefs.appDb.markImportedFromLocalStorage())
    .catch((error: unknown) => console.warn('Could not import preferences into the app data file.', error));
};

/** Sends batched changes to the file now. Resolves once they are written. */
const flushPreferences = (): Promise<void> => {
  const prefs = desktopPreferences;
  if (!prefs) return Promise.resolve();
  if (prefs.flushTimer !== null) {
    clearTimeout(prefs.flushTimer);
    prefs.flushTimer = null;
  }
  if (prefs.pending.size === 0) return Promise.resolve();
  const changes = Object.fromEntries(prefs.pending);
  prefs.pending.clear();
  return prefs.appDb
    .setPreferences(changes)
    .catch((error: unknown) => console.warn('Could not save preferences to the app data file.', error));
};

const queueDesktopWrite = (prefs: DesktopPreferences, key: string, value: string | null) => {
  if (value === null) prefs.cache.delete(key);
  else prefs.cache.set(key, value);
  prefs.pending.set(key, value);
  if (prefs.flushTimer === null) {
    prefs.flushTimer = setTimeout(() => void flushPreferences(), FLUSH_DELAY_MS);
  }
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

  const desktop = getDesktopPreferences();
  let stored: string | null;
  try {
    stored = desktop ? (desktop.cache.get(key) ?? null) : localStorage.getItem(key);
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
  const text = JSON.stringify(value);
  const desktop = getDesktopPreferences();
  if (desktop) queueDesktopWrite(desktop, key, text);
  try {
    localStorage.setItem(key, text);
  } catch (error) {
    // Blocked storage, or the quota is full. The preference is lost; the
    // app keeps working.
    warnStorageUnavailable(error);
  }
};

/**
 * Removes every stored preference except the open tabs. Used by
 * AppErrorBoundary, which reloads the page next, so wait for the result:
 * on desktop the removal has to reach the file first.
 */
export const resetPreferences = (): Promise<void> => {
  const desktop = getDesktopPreferences();
  for (const key of Object.values(STORAGE_KEYS)) {
    if (key === STORAGE_KEYS.SESSIONS) continue;
    if (desktop) queueDesktopWrite(desktop, key, null);
    try {
      localStorage.removeItem(key);
    } catch (error) {
      warnStorageUnavailable(error);
    }
  }
  return flushPreferences();
};
