#!/usr/bin/env node
// Builds the SQLite database the agent cases run on (test/agent-cases/).
// See test/agent-cases/README.md. Needs Node 22 or later.
//
//   node scripts/agent-case-db.mjs [path]      default: agent-cases.db here
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

process.removeAllListeners('warning');
const { DatabaseSync } = await import('node:sqlite');

const here = dirname(fileURLToPath(import.meta.url));
const target = resolve(process.argv[2] ?? 'agent-cases.db');
if (existsSync(target)) rmSync(target);
const db = new DatabaseSync(target);
db.exec(readFileSync(join(here, '..', 'test', 'agent-cases', 'fixture.sql'), 'utf8'));
db.close();
console.log(`Built ${target}. Add it in Beamlynx as a SQLite connection, and turn it on for agents.`);
