# Beamlynx

This repo holds the whole app, in three folders. Each has its own `AGENTS.md` with the rules for working in it:

- `desktop/`: the Electron app. It bundles the other two.
- `ui/`: the interface (Next.js, TypeScript, MobX).
- `pine/`: the Pine language and its server (Clojure).

## Running it

`bin/beam` runs everything in development. Use it rather than starting the parts by hand:

- `bin/beam dev`: the UI dev server and the desktop app together. Quitting the app stops both.
- `bin/beam ui [--browser]`: only the UI, on port 3142, in a browser tab.
- `bin/beam api`: only the Pine server, on port 33333.
- `bin/beam db [down|logs]`: the local Postgres and MySQL test databases.
- `bin/beam kill`: stops stray dev processes on those ports.

Don't run `bin/beam kill` or `bin/beam dev` while the owner may be using a dev app: both kill whatever holds the dev ports. Never run a test Pine server on 33333 or 33334, which the installed and dev apps use.

## Rules for the whole repo

- **A change that spans folders is one PR.** For example, a Pine feature, the UI that uses it, and the agent docs for it land together.
- **The three parts always ship together.** A release builds them from one commit, so the UI never meets an older Pine. Prefer the right shape for what the UI and Pine send each other over keeping the old one working.
- **Agent docs follow Pine in the same PR.** AI agents learn Pine from `desktop/src/main/mcp/pine-reference/`. A Pine change that an agent would write differently updates those files too. CI parses every example there with the Pine in `pine/`.
- **Every fix or feature adds a changelog entry right away**, under `## [Unreleased]` in the `CHANGELOG.md` of each folder it changes. Write for someone who knows the app only from the outside: what they notice, in one or two sentences. The release only moves these entries; it doesn't write them.
- **Never change these in `desktop/`:**
  - `"name": "beamlynx-desktop"` in `package.json`, which names the app's data folder;
  - `appId` and `productName`;
  - `publish.repo` in `electron-builder.yml`. Installed apps look for updates in this repo's GitHub Releases.
- **Releasing** is in `RELEASING.md`.

## How to write

This applies to documentation, commit messages, changelog entries and pull request descriptions. Readers should find what they need, understand it on the first read, and be able to act on it.

- One idea per sentence.
- Say what something is before naming its mechanism.
- Lead with the reader's question, not the order things were discovered.
- Keep exact names, paths and error codes. Explain jargon on first use, or cut it.
