// What's New in the app, and the bell's unread dot. The entries come from
// the app's changelog, ../desktop/CHANGELOG.md: scripts/build-changelog.ts
// turns it into changelog.generated.json before every dev run, build, type
// check and test (utils/parseChangelog.ts). That file isn't committed, so
// What's New always matches the changelog. Edit the changelog, never the
// generated file.
import generated from './changelog.generated.json';

export interface ChangelogItem {
  // A short, skimmable phrase naming what changed -- the thing a user reads
  // when scanning the list without stopping. Kept required so every entry
  // has one instead of only the ones someone remembered to write.
  title: string;
  // The fuller explanation: why it changed, how to use it, or what exactly
  // broke. Optional -- a title like "Dark mode" needs nothing more under it,
  // and repeating the title as a one-line "description" would just be noise.
  description?: string;
  example?: string;
}

export interface ChangelogVersion {
  version: string;
  date: string;
  added?: ChangelogItem[];
  changed?: ChangelogItem[];
  removed?: ChangelogItem[];
  fixed?: ChangelogItem[];
  security?: ChangelogItem[];
  breaking?: ChangelogItem[];
}

// Newest first, as in the changelog. Versions are the app's own (0.35.0),
// not the interface's package.json version.
export const CHANGELOG: ChangelogVersion[] = generated as ChangelogVersion[];

export const LATEST_VERSION = CHANGELOG[0]?.version ?? '0.0.0';
