export const TOTAL_BARS = 100;
export const MAX_COUNT = 300;

/** Not used anywhere */
export const generateRawData = () =>
  Array(TOTAL_BARS)
    .fill(null)
    .map((_, index) => {
      const seconds = index;
      const minutes = Math.floor(seconds / 60);
      const secs = seconds % 60;
      const time = `12:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

      // Generate a random count between 3 and MAX_COUNT
      const count = Math.floor(Math.random() * (MAX_COUNT - 3)) + 3;

      return {
        time,
        count,
      };
    });
