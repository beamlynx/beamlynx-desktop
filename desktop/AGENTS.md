# The desktop app

The Electron app. It starts the Pine server from `../pine` as a child process, shows the UI from `../ui` in a window, and keeps what the person saves. It also runs the MCP server that lets AI agents query the person's databases through the app.

The rules for the whole repo, and how to run and check the app, are in `../AGENTS.md`. To see a change here, run `bin/beam dev` from the repo's root. `DEVELOPMENT.md` explains the pieces it starts. How to release is in `../RELEASING.md`.

## Where things are

| Path | What it does |
|---|---|
| `src/main/index.ts` | Start-up: the window, the menu, the Pine server, the agent server. Read this first. |
| `src/main/server-process.ts`, `ports.ts`, `launch-secrets.ts` | Starting and stopping the Pine server: its port, and the token the UI and Pine share at each launch. |
| `src/preload/index.ts` | What the UI can call in the app, as `window.beamlynxDesktop`. Every new call the UI needs goes here, and in `../ui/desktop.d.ts`. |
| `src/main/credential-store.ts` | Saved connections, in `connections.json`. Passwords are encrypted with the OS keychain. |
| `src/main/app-db.ts`, `app-db-ipc.ts` | `beamlynx.db`, the app's own SQLite file: settings, tabs, column widths, recipes, the agent call log. Migrations only add. |
| `src/main/account.ts`, `usage-stats.ts`, `supabase/` | Sign-in and usage stats. See "Sign-in and usage stats" in `../AGENTS.md`. |
| `src/main/deep-link.ts`, `auto-update.ts` | `beamlynx://` links, and updates from this repo's GitHub Releases. |
| `src/main/mcp/` | The agent server. `stdio-relay.ts` is the process an agent starts (`beamlynx --mcp`). It forwards each tool call to `control-plane-server.ts` in the running app, which runs it in a tab through `render-bridge.ts`. |
| `src/main/mcp/instructions.ts`, `format.ts`, `pine-reference/` | What agents read: the server's instructions, how results are shown to them, and the Pine docs they can ask for. |
| `scripts/` | Build steps (staging Pine and the UI), CI checks, and dev tools such as `agent-retro.mjs`. |
| `__tests__/` | Unit tests, in plain Node with no Electron. `npm test` runs them. |
| `test/agent-cases/` | Questions to try through an agent before and after changing the agent server. |

Code that tests can reach is kept free of `electron` imports, so it runs in plain Node. Follow that when adding to `src/main/`.

## Never store a database's address, only its hash

A database's address is its type, host, port and name, such as `postgres://localhost:5432/shop`. The code calls it the database key (`databaseKeyOf` in `src/main/database-key.ts`). It tells anyone who reads a file where your databases are.

- beamlynx.db stores only the key's SHA-256 hash. Every write goes through `toStoredKey`, and every lookup through `storedKeyCandidates`. A migration in `src/main/app-db.ts` hashed the rows older apps wrote.
- Never write the key, a host, a port or pine-lang's connection id (`host:port:dbname`) to beamlynx.db, a log, the agent call log, usage stats (PostHog) or Supabase.
- The connection store (`src/main/credential-store.ts`) is the only file that keeps an address. It needs the address to connect.
- The renderer may get `databaseKey` over IPC, to match rows an older app wrote. beamlynx-ui never persists it.
- The `preference` table holds what beamlynx-ui saves, as JSON it writes. The same rule binds it: saved tabs keep the saved connection's random id, and connection colours are keyed by the hash. beamlynx-ui 0.74.0 and earlier saved pine-lang's ids there. The UI rewrites those values when it starts. Its `AGENTS.md` has the details.

Why a hash: two people with the same database get the same hash, so recipes and other things can be shared for that database without showing where it is. A saved connection's id is random and local to one client, so it shows nothing but can't be matched across clients.

A hash hides the address from someone reading the file. It is not a secret: anyone who guesses the address can hash it and compare. So never use the hash as a credential.
