// What the person sees about updates, worked out from what the updater did
// and the oldest version that may still be used. No Electron imports, so
// __tests__/update-decision.test.js can run it in plain Node.
//
// | Situation                                  | What the person sees                 |
// |--------------------------------------------|--------------------------------------|
// | Up to date                                 | nothing                              |
// | Behind, update downloading                 | nothing                              |
// | Behind, update downloaded                  | "Restart to update" chip, in header  |
// | Behind, the update can't install itself    | "Update to X" chip, in the header    |
// | Below the minimum                          | a screen that blocks the app, with   |
// |                                            | the progress, Restart or Download    |
// | Minimum unknown (offline), or no newer     | never blocked                        |
// | version published                          |                                      |

// What the updater (electron-updater) has done so far.
export type UpdaterState =
  | { kind: 'idle' } // not checked yet, or checking
  | { kind: 'up-to-date' } // the feed's newest version is this one
  | { kind: 'downloading'; version: string; percent: number }
  | { kind: 'downloaded'; version: string }
  // This copy can't update itself: the check or download failed, the
  // updater doesn't run here, or an update downloaded twice and still
  // didn't install. `version` is the newest published version, when known.
  | { kind: 'failed'; version: string | null };

// Sent to the window. Matches ../ui/desktop.d.ts DesktopUpdateStatus.
// `required` means this version is older than the minimum: the window then
// blocks everything until the person updates.
export type UpdateStatus =
  | { state: 'none' }
  | { state: 'downloading'; version: string; percent: number; required: boolean }
  | { state: 'downloaded'; version: string; required: boolean }
  | { state: 'download-yourself'; version: string; required: boolean };

// Release tags are plain X.Y.Z. Anything after a "-" is ignored, and a
// missing part counts as 0.
export function compareVersions(a: string, b: string): number {
  const parts = (v: string) => v.trim().replace(/^v/, '').split('-')[0].split('.').map(n => Number(n) || 0);
  const pa = parts(a);
  const pb = parts(b);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return 0;
}

// The version in a release's update file (latest.yml), whose first line is
// `version: 0.35.0`. null when the file doesn't say.
export function versionFromUpdateFile(text: string): string | null {
  const match = /^version:\s*['"]?([0-9][^\s'"]*)/m.exec(text);
  return match ? match[1] : null;
}

// The oldest version allowed, from desktop/minimum-version.json on main:
// {"minimum_version": "0.36.0"}, or null for none. undefined when the file
// can't be read as that, so a broken file never blocks anyone.
export function minimumFromFile(text: string): string | null | undefined {
  try {
    const value = (JSON.parse(text) as { minimum_version?: unknown })?.minimum_version;
    if (value === null) return null;
    if (typeof value === 'string' && /^\d+\.\d+\.\d+$/.test(value.trim())) return value.trim();
  } catch {
    // not JSON
  }
  return undefined;
}

export function decideUpdateStatus(input: {
  current: string;
  updater: UpdaterState;
  minimumVersion: string | null;
}): UpdateStatus {
  const { current, updater, minimumVersion } = input;
  // Only a version that is published and new enough can be required. So a
  // minimum raised before its release is out, or mistyped, blocks nobody.
  const required = (newer: string) =>
    minimumVersion !== null &&
    compareVersions(current, minimumVersion) < 0 &&
    compareVersions(newer, minimumVersion) >= 0;

  switch (updater.kind) {
    case 'downloading':
      return { state: 'downloading', version: updater.version, percent: updater.percent, required: required(updater.version) };
    case 'downloaded':
      return { state: 'downloaded', version: updater.version, required: required(updater.version) };
    case 'failed':
      if (updater.version === null || compareVersions(updater.version, current) <= 0) return { state: 'none' };
      return { state: 'download-yourself', version: updater.version, required: required(updater.version) };
    default:
      return { state: 'none' };
  }
}

// An update that downloaded but didn't install shows up only at the next
// launch: the app comes back on the old version. The updater would then
// download it again and offer "Restart Now" for ever. So the app writes down
// each version it downloads, and counts the launches that still run an older
// one. One such launch can be a crash or a power cut before the app quit.
// Two means installing doesn't work on this machine.
export type InstallAttempt = { version: string; launches: number };

export const FAILED_AFTER_LAUNCHES = 2;

// At launch: the record to keep (null to delete it), and whether installing
// has failed.
export function checkInstallAttempt(
  current: string,
  attempt: InstallAttempt | null,
): { keep: InstallAttempt | null; failedVersion: string | null } {
  if (!attempt || compareVersions(current, attempt.version) >= 0) return { keep: null, failedVersion: null };
  const launches = attempt.launches + 1;
  return {
    keep: { version: attempt.version, launches },
    failedVersion: launches >= FAILED_AFTER_LAUNCHES ? attempt.version : null,
  };
}
