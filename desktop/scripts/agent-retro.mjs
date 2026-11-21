#!/usr/bin/env node
// A retro on how agents used Beamlynx: reads the agent calls saved in
// beamlynx.db (src/main/mcp/agent-log.ts) and prints a report. See
// src/main/agent-retro.ts for how failures are sorted, and
// .claude/skills/agent-retro/SKILL.md for what to do with the report.
//
// Needs Node 22 or later (node:sqlite) and a build (npm run build).
//
//   node scripts/agent-retro.mjs                  the installed app's data
//   node scripts/agent-retro.mjs --dev            the dev build's data
//   node scripts/agent-retro.mjs --db path/to/beamlynx.db
//   node scripts/agent-retro.mjs --days 7         only the last 7 days
//   node scripts/agent-retro.mjs --json           the report as JSON
//
// The file is opened read-only, so it can run while the app is open.
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// node:sqlite warns that it is experimental on every run. Loaded after
// the warning listener is gone, so the report is all that prints.
process.removeAllListeners('warning');
const { DatabaseSync } = await import('node:sqlite');

const here = dirname(fileURLToPath(import.meta.url));
const compiled = join(here, '..', 'dist', 'main', 'agent-retro.js');
if (!existsSync(compiled)) {
  console.error('Build first: npm run build');
  process.exit(1);
}
const require = createRequire(import.meta.url);
const { analyze, formatReport } = require(compiled);
const { toAgentCall } = require(join(here, '..', 'dist', 'main', 'app-db.js'));

const args = process.argv.slice(2);
const flag = name => args.includes(name);
const value = name => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

// Where Electron keeps each copy's data (app.getPath('userData')). The dev
// build has its own folder (src/main/data-dir.ts).
function defaultDb(dev) {
  const name = dev ? 'beamlynx-desktop-dev' : 'beamlynx-desktop';
  const base =
    process.platform === 'darwin'
      ? join(homedir(), 'Library', 'Application Support')
      : process.platform === 'win32'
        ? process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming')
        : process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config');
  return join(base, name, 'beamlynx.db');
}

const file = value('--db') ?? defaultDb(flag('--dev'));
if (!existsSync(file)) {
  console.error(`No beamlynx.db at ${file}. Pass --db, or --dev for the dev build's.`);
  process.exit(1);
}
const days = Number(value('--days'));
const since = Number.isFinite(days) && days > 0 ? Date.now() - days * 86_400_000 : 0;

const db = new DatabaseSync(file, { readOnly: true });
const hasTable = db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'agent_call'").get();
if (!hasTable) {
  console.error(`${file} has no agent calls yet: it was last opened by an app from before they were saved.`);
  process.exit(1);
}
const rows = db.prepare('SELECT * FROM agent_call WHERE started_at >= ? ORDER BY started_at ASC, rowid ASC').all(since);
db.close();

const report = analyze(rows.map(toAgentCall));
console.log(flag('--json') ? JSON.stringify(report, null, 2) : formatReport(report));
