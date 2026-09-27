
const isDesktop = process.env.NEXT_DESKTOP === '1';

// Walks Next's webpack rules and sets the publicPath of the loader that
// extracts CSS into files (mini-css-extract-plugin's).
function setCssExtractPublicPath(rules, publicPath) {
  for (const rule of rules ?? []) {
    if (!rule || typeof rule !== 'object') continue;
    if (typeof rule.loader === 'string' && rule.loader.includes('mini-css-extract-plugin')) {
      rule.options = { ...rule.options, publicPath };
    }
    setCssExtractPublicPath(rule.oneOf, publicPath);
    setCssExtractPublicPath(rule.rules, publicPath);
    if (Array.isArray(rule.use)) setCssExtractPublicPath(rule.use, publicPath);
  }
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Backs the Settings About section's "UI version" row -- inlined at build
  // time from this build's own package.json, since there's no server to ask
  // (unlike GlobalStore.version, which comes from the connected pine-lang
  // server) and no Electron main process to ask (unlike the desktop app's
  // own version, see desktop.d.ts's getAppVersion).
  env: { NEXT_PUBLIC_APP_VERSION: require('./package.json').version },
  // The desktop app (beamlynx-desktop) bundles a static export and loads it
  // via file://, which needs relative asset URLs and real index.html files
  // per route -- Next's defaults (absolute /_next/... paths, extensionless
  // routes) 404 under file://. Gated behind an env flag so the hosted build
  // is unaffected.
  ...(isDesktop ? { output: 'export', assetPrefix: './', trailingSlash: true } : {}),
  // CSS asset URLs (the bundled fonts' files) have to be relative to the
  // CSS file itself under file://. Next writes them as
  // `${assetPrefix}/_next/...`, which with a relative assetPrefix resolves
  // against the stylesheet's folder (_next/static/css/) and misses. `../../`
  // from there is _next/, where the files are.
  ...(isDesktop
    ? {
        webpack: config => {
          setCssExtractPublicPath(config.module.rules, '../../');
          return config;
        },
      }
    : {}),
}

module.exports = nextConfig
