// Fails the build unless every font the app uses is inside the build's own
// output, reachable the way the browser will look for it.
//
// Runs after `next build` (see package.json's "build"). Checks, for the
// hosted build (.next/) or the desktop static export (out/):
//
// 1. Every family and weight in BUNDLED_FONTS (styles/app-font.ts) has an
//    @font-face rule in the emitted CSS.
// 2. Each rule's woff2 URL resolves to a file that exists, resolved as a
//    browser would: relative to the stylesheet for the desktop export,
//    which loads from file://, and from the site root for the hosted build.
// 3. Nothing the page loads (stylesheets, <link> tags) fetches a font or a
//    stylesheet from another host, Google Fonts included.
//
// A font that fails any of these would otherwise ship as a silent fallback.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const desktop = process.env.NEXT_DESKTOP === '1';
const outDir = desktop ? path.join(root, 'out') : path.join(root, '.next');
const problems = [];

// ---- what must be there: BUNDLED_FONTS, read from the source ----
const fontSource = readFileSync(path.join(root, 'styles/app-font.ts'), 'utf8');
const listBody = fontSource.slice(fontSource.indexOf('BUNDLED_FONTS'));
const required = [...listBody.matchAll(/family:\s*'([^']+)',\s*weights:\s*\[([^\]]+)\]/g)].map(m => ({
  family: m[1],
  weights: m[2].split(',').map(w => Number(w.trim())),
}));
if (required.length === 0) problems.push('Could not read BUNDLED_FONTS from styles/app-font.ts.');

// ---- what the build produced ----
function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === 'cache') continue; // .next/cache is not shipped
      walk(p, out);
    } else out.push(p);
  }
  return out;
}
const files = walk(outDir);
if (files.length === 0) {
  console.error(`check-bundle-assets: no build output in ${path.relative(root, outDir)}/. Run next build first.`);
  process.exit(1);
}
const cssFiles = files.filter(f => f.endsWith('.css') && f.includes(`${path.sep}static${path.sep}`));

// Where a CSS url() points, as the browser would resolve it.
function resolveUrl(cssFile, url) {
  if (/^(https?:)?\/\//.test(url)) return { external: true };
  if (url.startsWith('data:')) return { file: null };
  const clean = url.split(/[?#]/)[0];
  if (clean.startsWith('/')) {
    // Site-root URL. Hosted: /_next/... is served from .next/. Under file://
    // (desktop) a root URL means the filesystem root, which is always wrong.
    if (desktop) return { file: null, reason: 'a root-relative URL, which file:// resolves against the disk root' };
    return { file: path.join(outDir, clean.replace(/^\/_next\//, '/')) };
  }
  return { file: path.resolve(path.dirname(cssFile), clean) };
}

const found = new Map(); // "family|weight" -> [status]
for (const css of cssFiles) {
  const text = readFileSync(css, 'utf8');
  for (const m of text.matchAll(/@font-face\s*{([^}]*)}/g)) {
    const block = m[1];
    const family = /font-family:\s*["']?([^;"']+)["']?/.exec(block)?.[1]?.trim();
    const weight = Number(/font-weight:\s*(\d+)/.exec(block)?.[1] ?? 400);
    const urls = [...block.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)].map(u => u[1]);
    if (!family) continue;
    for (const url of urls) {
      const r = resolveUrl(css, url);
      if (r.external) problems.push(`${family} ${weight} loads from another host: ${url}`);
    }
    const woff2 = urls.find(u => u.split(/[?#]/)[0].endsWith('.woff2'));
    if (!woff2) continue;
    const r = resolveUrl(css, woff2);
    const ok = !!r.file && existsSync(r.file);
    const key = `${family}|${weight}`;
    if (!found.has(key)) found.set(key, []);
    found.get(key).push(ok ? 'ok' : `${woff2} -> ${r.reason ?? (r.file ? path.relative(root, r.file) : 'nothing')}`);
  }
}

for (const { family, weights } of required) {
  for (const w of weights) {
    const entries = found.get(`${family}|${w}`);
    if (!entries) problems.push(`${family} ${w}: no @font-face rule in the output CSS.`);
    else if (!entries.includes('ok')) problems.push(`${family} ${w}: its file isn't where the browser will look (${entries[0]}).`);
  }
}

// ---- nothing may load a font from elsewhere ----
// What the page actually requests: stylesheets' @import and url(), and the
// <link> tags in the HTML. Next's own JavaScript carries the Google Fonts
// hostnames as constants (for its <link> optimization), which load nothing,
// so JavaScript isn't scanned.
const REMOTE_FONT = /fonts\.(googleapis|gstatic)\.com|use\.typekit\.net/;
for (const f of cssFiles) {
  const text = readFileSync(f, 'utf8');
  for (const m of text.matchAll(/@import\s+(?:url\()?\s*["']?([^"')\s;]+)/g)) {
    if (/^(https?:)?\/\//.test(m[1])) problems.push(`${path.relative(root, f)} imports a stylesheet from another host: ${m[1]}`);
  }
  if (REMOTE_FONT.test(text)) problems.push(`${path.relative(root, f)} refers to a hosted font service.`);
}
for (const f of files.filter(f => f.endsWith('.html'))) {
  const text = readFileSync(f, 'utf8');
  for (const m of text.matchAll(/<link\b[^>]*href="([^"]+)"/g)) {
    if (REMOTE_FONT.test(m[1])) problems.push(`${path.relative(root, f)} links ${m[1]}`);
  }
}

const target = desktop ? 'desktop export (out/)' : 'hosted build (.next/)';
if (problems.length) {
  console.error(`\ncheck-bundle-assets: the ${target} is missing fonts it needs:\n`);
  for (const p of [...new Set(problems)]) console.error(`  - ${p}`);
  console.error('\nEvery font must ship inside the build. See styles/app-font.ts.\n');
  process.exit(1);
}
const count = required.reduce((n, r) => n + r.weights.length, 0);
console.log(`check-bundle-assets: ${count} font faces present and reachable in the ${target}.`);
