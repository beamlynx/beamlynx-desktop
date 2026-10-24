// Where usage stats and sign-in go: the PostHog project and the Supabase
// project. Both keys are public keys, meant to ship in apps.
//
// A release build reads them from service-config.json next to this file,
// which scripts/write-service-config.js writes in the release workflow. A
// build without that file has neither: no usage stats and no sign-in. That is
// every dev build, so working on the app never sends anything.
//
// To try sign-in or usage stats from a dev build, set the same environment
// variables the release workflow uses (BEAMLYNX_SUPABASE_URL and so on)
// before `npm start`. A packaged build ignores them.
import * as fs from 'fs';
import * as path from 'path';

export type ServiceConfig = {
  posthogKey: string | null;
  posthogHost: string;
  supabaseUrl: string | null;
  supabaseKey: string | null;
};

const ENV = {
  posthogKey: 'BEAMLYNX_POSTHOG_KEY',
  posthogHost: 'BEAMLYNX_POSTHOG_HOST',
  supabaseUrl: 'BEAMLYNX_SUPABASE_URL',
  supabaseKey: 'BEAMLYNX_SUPABASE_KEY',
} as const;

// The website's PostHog project is on PostHog's EU cloud.
const DEFAULT_POSTHOG_HOST = 'https://eu.i.posthog.com';

export function loadServiceConfig(isPackaged: boolean, file = path.join(__dirname, 'service-config.json')): ServiceConfig {
  let fromFile: Partial<Record<keyof typeof ENV, string>> = {};
  try {
    fromFile = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    // No file: a dev build, or a build made without the keys.
  }
  const read = (key: keyof typeof ENV): string | null => {
    const value = (!isPackaged && process.env[ENV[key]]) || fromFile[key];
    return typeof value === 'string' && value.trim() ? value.trim() : null;
  };
  return {
    posthogKey: read('posthogKey'),
    posthogHost: read('posthogHost') ?? DEFAULT_POSTHOG_HOST,
    supabaseUrl: read('supabaseUrl'),
    supabaseKey: read('supabaseKey'),
  };
}
