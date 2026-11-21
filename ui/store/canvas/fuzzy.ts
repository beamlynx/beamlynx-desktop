// Fuzzy matching for canvas suggestion lists. Whitespace in the query is
// ignored and case is folded, so "ordr itm" finds "order_items".

/** Score of `query` against `text`, or null when it does not match. Higher is better. */
export const fuzzyScore = (query: string, text: string): number | null => {
  const q = query.toLowerCase().replace(/\s+/g, '');
  if (!q) return 0;
  const t = text.toLowerCase();
  if (t === q) return 10000;
  if (t.startsWith(q)) return 8000 - (t.length - q.length);
  const at = t.indexOf(q);
  if (at >= 0) return 6000 - at * 10 - (t.length - q.length);
  // Subsequence: every query char appears in order. Reward word-boundary
  // hits and consecutive runs, penalise gaps and late starts.
  let score = 2000;
  let from = 0;
  let prev = -2;
  for (const ch of q) {
    const i = t.indexOf(ch, from);
    if (i < 0) return null;
    if (i === prev + 1) score += 15;
    else score -= (i - from) * 3;
    if (i === 0 || /[^a-z0-9]/.test(t[i - 1])) score += 10;
    prev = i;
    from = i + 1;
  }
  return score - t.length;
};

/** Filters `items` to fuzzy matches, best first (ties keep their order). Empty query: unchanged. */
export const fuzzyFilter = <T>(items: T[], query: string, label: (item: T) => string): T[] => {
  if (!query.trim()) return items;
  return items
    .map((item, index) => ({ item, index, score: fuzzyScore(query, label(item)) }))
    .filter((r): r is { item: T; index: number; score: number } => r.score !== null)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(r => r.item);
};
