const isDesktop = process.env.NEXT_DESKTOP === '1';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The desktop app (beamlynx-desktop) bundles a static export and loads it
  // via file://, which needs relative asset URLs and real index.html files
  // per route -- Next's defaults (absolute /_next/... paths, extensionless
  // routes) 404 under file://. Gated behind an env flag so the hosted build
  // is unaffected.
  ...(isDesktop ? { output: 'export', assetPrefix: './', trailingSlash: true } : {}),
}

module.exports = nextConfig
