import { DevState } from "./dev-state";

export const prettifyExpression = (expression: string): string => {
  const parts = expression.split('|');
  return (
    parts
      .map(x => x.trim())
      .filter(Boolean)
      .join('\n | ') + '\n | '
  );
};

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
  if (DevState.playground !== undefined) {
    return DevState.playground;
  }
  const url = new URL(window.location.href);
  return url.hostname.startsWith('playground');
};


export const isDevelopment = () => process.env.NODE_ENV === 'development';
