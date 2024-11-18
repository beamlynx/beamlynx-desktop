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
