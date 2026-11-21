#!/usr/bin/env node
// Fails when a change to supabase/migrations/ could break an app that is
// already released. See supabase/README.md for the rules.
//
// - A migration that is already merged must not change: it has already run.
// - A new migration must only add. Statements that drop, rename, retype,
//   tighten or revoke are refused, unless their line ends with
//   `-- compat: <reason>` for a reviewer to read.
//
// It reads SQL with simple patterns. It is a guard, not a proof.
//
// Usage: node scripts/check-supabase-migrations.js [base-ref]
// The base defaults to where this branch left origin/main. On main itself,
// it is the previous commit.
const { execFileSync } = require('child_process');
const fs = require('fs');

const DIR = 'supabase/migrations';

const RULES = [
  [/\bdrop\s+(table|column|function|view|materialized\s+view|schema|type|index|policy|trigger|constraint)\b/i, 'drops something'],
  [/\brename\b/i, 'renames something'],
  [/\balter\s+column\s+\S+\s+(set\s+data\s+)?type\b/i, "changes a column's type"],
  [/\bset\s+not\s+null\b/i, 'makes a column NOT NULL'],
  [/\brevoke\b/i, 'takes away a permission'],
  [/\b(truncate|delete\s+from)\b/i, 'deletes rows'],
];

// The problems in one migration's SQL, as readable lines.
function checkMigrationSql(sql) {
  const problems = [];
  // Lines a reviewer has accepted are left out.
  const lines = sql.split('\n').map(line => (/--\s*compat:\s*\S/.test(line) ? '' : line));
  const text = lines
    .join('\n')
    .replace(/\$([A-Za-z_]*)\$[\s\S]*?\$\1\$/g, "''") // function bodies
    .replace(/'(?:[^']|'')*'/g, "''") // strings
    .replace(/--[^\n]*/g, '') // line comments
    .replace(/\/\*[\s\S]*?\*\//g, ''); // block comments
  for (const statement of text.split(';')) {
    const s = statement.trim().replace(/\s+/g, ' ');
    if (!s) continue;
    for (const [pattern, why] of RULES) {
      if (pattern.test(s)) problems.push(`${why}: ${s.slice(0, 120)}`);
    }
    if (/\badd\s+(column\s+)?\S+\s[^,]*\bnot\s+null\b/i.test(s) && !/\bdefault\b/i.test(s) && /\balter\s+table\b/i.test(s)) {
      problems.push(`adds a NOT NULL column without a default: ${s.slice(0, 120)}`);
    }
  }
  return problems;
}

function git(...args) {
  return execFileSync('git', args, { encoding: 'utf8' }).trim();
}

function main() {
  let base = process.argv[2];
  if (!base) {
    base = git('merge-base', 'origin/main', 'HEAD');
    if (base === git('rev-parse', 'HEAD')) base = 'HEAD~1';
  }
  // --relative: paths come out relative to this folder, as DIR is.
  const changes = git('diff', '--name-status', '--no-renames', '--relative', `${base}...HEAD`, '--', DIR)
    .split('\n')
    .filter(Boolean)
    .map(line => line.split('\t'));

  // A migration that only moved to another folder isn't new. The repo's
  // folders moved once: this one was at the repo's root until pine-lang and
  // beamlynx-ui moved in. Merged migrations by file name, with their content.
  const merged = new Map(
    git('ls-tree', '-r', '--full-tree', base)
      .split('\n')
      .filter(line => /(^|\/)supabase\/migrations\/[^/]+$/.test(line.split('\t')[1] || ''))
      .map(line => [line.split('\t')[1].split('/').pop(), line.split(/\s+/)[2]]),
  );

  const failures = [];
  for (const [status, file] of changes) {
    const before = merged.get(file.split('/').pop());
    if (status !== 'A' || (before && before !== git('hash-object', file))) {
      failures.push(`${file}: a merged migration was changed or removed. Add a new migration instead.`);
      continue;
    }
    if (before) continue;
    for (const problem of checkMigrationSql(fs.readFileSync(file, 'utf8'))) {
      failures.push(`${file}: ${problem}`);
    }
  }

  if (failures.length) {
    console.error('These migrations could break an app that is already released (see supabase/README.md):\n');
    for (const f of failures) console.error(`  ${f}`);
    console.error('\nIf one is safe, end its line with `-- compat: <why>`.');
    process.exit(1);
  }
  console.log(`Migrations OK (${changes.length} changed since ${base.slice(0, 12)}).`);
}

if (require.main === module) main();
module.exports = { checkMigrationSql };
