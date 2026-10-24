#!/usr/bin/env node
// Writes dist/main/service-config.json from the release workflow's
// environment, so a release build knows where usage stats and sign-in go
// (see src/main/service-config.ts). Run after `npm run build`. Variables that
// are unset are left out, and the app turns that feature off.
const fs = require('fs');
const path = require('path');

const config = {
  posthogKey: process.env.BEAMLYNX_POSTHOG_KEY,
  posthogHost: process.env.BEAMLYNX_POSTHOG_HOST,
  supabaseUrl: process.env.BEAMLYNX_SUPABASE_URL,
  supabaseKey: process.env.BEAMLYNX_SUPABASE_KEY,
};
for (const key of Object.keys(config)) {
  if (!config[key]) delete config[key];
}

const out = path.join(__dirname, '..', 'dist', 'main', 'service-config.json');
fs.writeFileSync(out, JSON.stringify(config, null, 2) + '\n');
console.log(`Wrote ${out} with: ${Object.keys(config).join(', ') || 'nothing'}`);
