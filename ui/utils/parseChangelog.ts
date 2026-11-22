import type { ChangelogItem, ChangelogVersion } from './changelog.data';

// Turns the app's changelog (desktop/CHANGELOG.md) into what What's New
// shows. scripts/build-changelog.ts runs it before every dev run, build,
// type check and test, so What's New never needs copying by hand.
//
// It reads the keepachangelog shape the file uses:
//   ## [0.35.0] - 2026-11-25
//   ### Added
//   - **A short title.** The longer description.
// The Unreleased section is left out: What's New shows released versions.

const SECTIONS: Record<string, keyof Omit<ChangelogVersion, 'version' | 'date'>> = {
  added: 'added',
  changed: 'changed',
  removed: 'removed',
  fixed: 'fixed',
  security: 'security',
  breaking: 'breaking',
};

// What's New shows plain text, so Markdown links keep only their text, and
// bold markers go. Entries from before Pine and the UI shipped only inside
// the app end with "(bundled beamlynx-ui 0.79.0)": readers of the app don't
// need it.
function plain(text: string): string {
  return text
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\*\*/g, '')
    .replace(/\s*\(bundled [^)]*\)/g, '')
    .trim();
}

export function parseItem(line: string): ChangelogItem {
  const body = line.replace(/^-\s+/, '');
  const bold = /^\*\*(.+?)\*\*\s*(.*)$/.exec(body);
  if (!bold) return { title: plain(body) };
  const title = plain(bold[1]).replace(/[.,:;]$/, '');
  const rest = plain(bold[2]);
  if (!rest) return { title };
  return { title, description: rest.charAt(0).toUpperCase() + rest.slice(1) };
}

export function parseChangelog(markdown: string): ChangelogVersion[] {
  const versions: ChangelogVersion[] = [];
  let version: ChangelogVersion | null = null;
  let section: keyof typeof SECTIONS | null = null;

  for (const line of markdown.split('\n')) {
    const heading = /^## \[([^\]]+)\](?:\s*-\s*(\S+))?/.exec(line);
    if (heading) {
      const [, name, date] = heading;
      version = /^\d+\.\d+\.\d+$/.test(name) ? { version: name, date: date ?? '' } : null;
      if (version) versions.push(version);
      section = null;
      continue;
    }
    const sub = /^### (\w+)/.exec(line);
    if (sub) {
      const key = sub[1].toLowerCase();
      section = key in SECTIONS ? key : null;
      continue;
    }
    if (version && section && /^-\s+/.test(line)) {
      const field = SECTIONS[section];
      (version[field] ??= []).push(parseItem(line));
    }
  }
  return versions;
}
