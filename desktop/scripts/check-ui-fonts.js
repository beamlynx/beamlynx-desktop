// Fails unless the staged UI (resources/ui) loads every font it is meant to
// ship, in Electron itself, from file:// - exactly how the packaged app
// loads it. Run after scripts/build-ui-export.sh:
//
//   npx electron --no-sandbox scripts/check-ui-fonts.js [path/to/beamlynx-ui]
//
// On Linux CI it needs a display, and --no-sandbox on the command line
// (Electron checks its sandbox helper before any of this script runs):
// `xvfb-run -a npx electron --no-sandbox ...`.
//
// The UI's own build already checks that the font files are in its output
// (beamlynx-ui/scripts/check-bundle-assets.mjs). This checks the other half:
// that the real app, under file://, actually loads them. Which fonts are
// required comes from BUNDLED_FONTS in the UI's styles/app-font.ts, so a UI
// version that bundles no fonts at all fails here too, instead of passing
// because nothing was expected.
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const uiIndex = path.join(root, 'resources', 'ui', 'index.html');
// The UI checkout: the first argument that isn't a flag or this script.
const uiArg = process.argv.slice(1).find(a => !a.startsWith('-') && !a.endsWith('check-ui-fonts.js'));
const uiSource = path.resolve(uiArg ?? path.join(root, '..', 'beamlynx-ui'));
const TIMEOUT_MS = 30000;

function fail(message) {
  console.error(`\ncheck-ui-fonts: ${message}\n`);
  app.exit(1);
}

function requiredFonts() {
  const file = path.join(uiSource, 'styles', 'app-font.ts');
  if (!fs.existsSync(file)) return null;
  const text = fs.readFileSync(file, 'utf8');
  const at = text.indexOf('BUNDLED_FONTS');
  if (at < 0) return null;
  return [...text.slice(at).matchAll(/family:\s*'([^']+)',\s*weights:\s*\[([^\]]+)\]/g)].map(m => ({
    family: m[1],
    weights: m[2].split(',').map(w => Number(w.trim())),
  }));
}

// CI containers: a /dev/shm too small or locked down for Chromium's shared
// memory. (--no-sandbox has to be on the command line; see above.)
app.commandLine.appendSwitch('disable-dev-shm-usage');
app.disableHardwareAcceleration();

app.whenReady().then(async () => {
  if (!fs.existsSync(uiIndex)) return fail(`no staged UI at ${path.relative(root, uiIndex)}. Run scripts/build-ui-export.sh first.`);
  const required = requiredFonts();
  if (!required || required.length === 0) {
    return fail(
      `the UI at ${uiSource} lists no bundled fonts (BUNDLED_FONTS in styles/app-font.ts). ` +
        'A UI version that does not ship its fonts would draw them only where they happen to be installed.',
    );
  }

  const win = new BrowserWindow({ show: false, webPreferences: { offscreen: true } });
  const timer = setTimeout(() => fail(`the UI did not finish loading within ${TIMEOUT_MS / 1000}s.`), TIMEOUT_MS);
  try {
    await win.loadFile(uiIndex);
  } catch (e) {
    clearTimeout(timer);
    return fail(`the staged UI failed to load: ${e.message}`);
  }

  // Every weight of every required family must load. document.fonts.load
  // resolves to the faces it loaded, and to [] when no @font-face matches.
  const results = await win.webContents.executeJavaScript(`
    (async () => {
      const required = ${JSON.stringify(required)};
      const out = [];
      for (const { family, weights } of required) {
        for (const w of weights) {
          let status;
          try {
            const faces = await document.fonts.load(w + ' 16px "' + family + '"');
            status = faces.length === 0 ? 'no @font-face' : faces.every(f => f.status === 'loaded') ? 'loaded' : faces.map(f => f.status).join('/');
          } catch (e) {
            status = 'failed: ' + e.message;
          }
          out.push({ face: family + ' ' + w, status });
        }
      }
      return out;
    })()
  `);
  clearTimeout(timer);

  const bad = results.filter(r => r.status !== 'loaded');
  if (bad.length) {
    return fail(
      `${bad.length} of ${results.length} font faces did not load in the staged UI:\n` +
        bad.map(r => `  - ${r.face}: ${r.status}`).join('\n'),
    );
  }
  console.log(`check-ui-fonts: all ${results.length} font faces load in the staged UI (file://).`);
  app.exit(0);
});
