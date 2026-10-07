import { DevState } from './dev-state';

/**
 * Creates a debounced version of a function that delays execution until after
 * a specified wait time has elapsed since the last call.
 *
 * @param func - The function to debounce
 * @param wait - Time in milliseconds to wait before executing
 * @returns A debounced version of the input function
 *
 * @example
 * const debouncedSearch = debounce((query) => {
 *   // Search logic here
 * }, 300);
 */
export const debounce = (func: (...args: any[]) => void, wait: number) => {
  // Track the pending timeout
  let timeout: NodeJS.Timeout;

  // Return wrapped function
  return (...args: any[]) => {
    // Clear any existing timeout
    clearTimeout(timeout);

    // Set new timeout
    timeout = setTimeout(() => {
      func(...args);
    }, wait);
  };
};

/**
 * Shows text only in development mode
 * @param text - The text to show in development mode
 * @returns The text if in development mode, empty string otherwise
 *
 * @example
 * console.log(devOnly('Debug info')); // Shows 'Debug info' in development, '' in production
 */
export const devOnly = (text: string): string => {
  return isDevelopment() ? text : '';
};

export const isPlayground = () => {
  // First check if explicitly set in DevState (for testing/development overrides)
  if (DevState.playground !== undefined) {
    return DevState.playground;
  }

  // Check hostname if we're in browser environment
  if (typeof window !== 'undefined') {
    try {
      const hostname = window.location.hostname;
      return hostname.includes('playground');
    } catch (error) {
      // Fallback if there's any issue accessing window.location
      console.warn('Error checking hostname for playground detection:', error);
    }
  }

  // Default to false for SSR and when detection fails
  return false;
};

export const isDevelopment = () => {
  // First check if explicitly set in DevState (for testing/development overrides)
  if (DevState.development !== undefined) {
    return DevState.development;
  }
  return process.env.NODE_ENV === 'development';
};

// True only for the beamlynx-desktop static-export build (see
// beamlynx-desktop/scripts/build-ui-export.sh, which sets NEXT_PUBLIC_DESKTOP
// alongside next.config.js's NEXT_DESKTOP). The server URL doesn't depend on
// this flag -- getBaseUrl() in client.ts asks the desktop bridge directly --
// so this is only for gating things that assume a hosted context, like Clerk
// auth in pages/index.tsx.
export const isDesktop = () => {
  if (DevState.desktop !== undefined) {
    return DevState.desktop;
  }
  return process.env.NEXT_PUBLIC_DESKTOP === '1';
};

/**
 * A Pine string literal holding exactly `x`: wrapped in single quotes, with
 * each apostrophe inside doubled, as in SQL ('O''Brien'). Pine has no other
 * escapes, so this is complete: nothing in `x` can end the literal early.
 *
 * Needs a pine-lang that reads '' inside a string (after 0.48.1). The
 * function this replaced turned every apostrophe into an underscore, so a
 * cell edited to O'Brien was saved as O_Brien.
 */
export const pineString = (x: string): string => `'${x.replace(/'/g, "''")}'`;

export const CONNECTION_COLOR_PALETTE = [
  '#4ade80', // green
  '#f87171', // red
  '#60a5fa', // blue
  '#fb923c', // orange
  '#a78bfa', // purple
  '#2dd4bf', // teal
  '#f472b6', // pink
  '#facc15', // yellow
];