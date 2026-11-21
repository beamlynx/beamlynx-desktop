const path = require('path');

const isDesktop = process.env.NEXT_DESKTOP === '1';

// Where this server should forward /api/v1/* to, e.g. http://localhost:33333.
// For a hosted dev copy (a cloud preview): the browser there can't reach the
// pine server at its own localhost:33333, so the UI calls pine on this page's
// origin instead (getBaseUrl in store/client.ts) and this server passes the
// calls on. Unset everywhere else, which changes nothing. Not for the desktop
// build: a static export has no server to forward anything.
const pineProxyUrl = isDesktop ? undefined : process.env.PINE_SERVER_PROXY_URL?.replace(/\/+$/, '');

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
  env: {
    NEXT_PUBLIC_APP_VERSION: require('./package.json').version,
    ...(pineProxyUrl ? { NEXT_PUBLIC_PINE_SAME_ORIGIN: '1' } : {}),
  },
  ...(pineProxyUrl
    ? {
        async rewrites() {
          return [{ source: '/api/v1/:path*', destination: `${pineProxyUrl}/api/v1/:path*` }];
        },
      }
    : {}),
  // The desktop app (beamlynx-desktop) bundles a static export and loads it
  // via file://, which needs relative asset URLs and real index.html files
  // per route -- Next's defaults (absolute /_next/... paths, extensionless
  // routes) 404 under file://. Gated behind an env flag so the hosted build
  // is unaffected.
  ...(isDesktop ? { output: 'export', assetPrefix: './', trailingSlash: true } : {}),
  webpack: config => {
    // The results grid's library (Glide) imports `marked` and
    // `react-responsive-carousel` for Markdown and Image cells, which the
    // grid never draws. Both point at a stub that throws if ever called.
    // See components/results-grid/glide-unused-peers.ts before drawing
    // either kind of cell.
    const unusedPeers = path.resolve(__dirname, 'components/results-grid/glide-unused-peers.ts');
    config.resolve.alias = {
      ...config.resolve.alias,
      marked$: unusedPeers,
      'react-responsive-carousel$': unusedPeers,
    };
    // CSS asset URLs (the bundled fonts' files) have to be relative to the
    // CSS file itself under file://. Next writes them as
    // `${assetPrefix}/_next/...`, which with a relative assetPrefix resolves
    // against the stylesheet's folder (_next/static/css/) and misses. `../../`
    // from there is _next/, where the files are.
    if (isDesktop) setCssExtractPublicPath(config.module.rules, '../../');
    return config;
  },
}

module.exports = nextConfig
