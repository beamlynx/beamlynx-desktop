// Stands in for `marked` and `react-responsive-carousel` in the app's bundle
// (next.config.js aliases both packages here). The results grid's library,
// Glide, imports them at the top of its Markdown and Image cell code, so
// they were bundled although the grid only ever draws Text cells (about
// 65 KB). __tests__/results-grid-cells.test.js checks that it still does.
// A grid that draws Markdown or Image cells needs the real packages back:
// remove the aliases in next.config.js.

const unavailable = (what: string) => () => {
  throw new Error(`${what} cells are not bundled: see components/results-grid/glide-unused-peers.ts`);
};

export const marked = unavailable('Markdown');
export const Carousel = unavailable('Image');
