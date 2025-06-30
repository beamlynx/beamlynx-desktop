export const STORAGE_KEYS = {
  SIDEBAR_WIDTH: 'pine-sidebar-width',
  THEME: 'pine-theme',
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
