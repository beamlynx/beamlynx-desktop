const path = require('path');

const isDesktop = process.env.NEXT_DESKTOP === '1';

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
  // next/font (styles/app-font.ts) validates this same relative assetPrefix
  // at build time and fails the whole build the moment webpack parses it --
  // swap in the desktop-safe stand-in (styles/app-font.desktop.ts) before
  // webpack ever gets there, rather than trying to branch inside app-font.ts
  // itself (next/font requires its call to be an unconditional, static
  // `const` at module scope -- a runtime/conditional check inside that file
  // doesn't stop its compiler plugin from still parsing and rejecting it).
  ...(isDesktop
    ? {
        webpack: config => {
          config.resolve.alias[path.resolve(__dirname, 'styles/app-font')] = path.resolve(
            __dirname,
            'styles/app-font.desktop.ts',
          );
          return config;
        },
      }
    : {}),
}

module.exports = nextConfig
