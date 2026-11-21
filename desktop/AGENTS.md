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

## Database addresses in the main process

The rule is in `../AGENTS.md`: never store a database's address, only its hash. Here it means:

- `databaseKeyOf` in `src/main/database-key.ts` makes the key.
- beamlynx.db stores only the key's SHA-256 hash. Every write goes through `toStoredKey`, and every lookup through `storedKeyCandidates`. A migration in `src/main/app-db.ts` hashed the rows older apps wrote.
- The agent call log, usage stats (PostHog) and Supabase never get the key, a host or a port either.
- The UI may get `databaseKey` over IPC, to match rows an older app wrote. It never persists it.
- The `preference` table holds what the UI saves, as JSON the UI writes. The same rule binds it. `../ui/AGENTS.md` has the details.
