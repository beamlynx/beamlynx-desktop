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

## Sign-in and usage stats

The desktop app has an optional sign-in. It asks at each launch until the person signs in. The app also sends anonymous usage stats. Both shipped in 0.23.0 (2026-10-26).

- **What it's for:** knowing who uses Beamlynx. Nothing in the app depends on it, and the app works offline.
- **Sign-in** uses GitHub or Google, through Supabase. Google is hidden (`SHOW_GOOGLE` in `ui/`) until Google verifies the brand.
- **Usage stats** go to PostHog. Launches, and who is signed in, are always sent. The switch in Settings → Account (Send detailed usage stats) covers only query counts and database types.
- **How sign-in returns to the app:** the browser returns to a short-lived server on `127.0.0.1`. A page loaded from `file://` can't receive the return itself. That is why Clerk, the earlier provider, failed, and it was removed (beamlynx/beamlynx-ui#118).
- **The Supabase schema** is in `desktop/supabase/`. Every released app keeps using it, so read `desktop/supabase/README.md` before changing it. CI's required `supabase` check guards it.
- **The web build** has no sign-in.

## How to write

This applies to documentation, commit messages, changelog entries and pull request descriptions.

Follow plain-language principles (ISO 24495-1): readers should get what they need, find it easily, understand it on the first read, and be able to act on it. Plain does not mean vague. Keep the technical precision, and drop the density.

- **One idea per sentence.** If a sentence has two em-dashes or three clauses, it is carrying three ideas. Split it.
- **Say what something is before naming its mechanism.** "A saved connection has a flag the desktop app checks to decide which ones an AI agent can query" beats "`SavedConnectionMeta.mcpEnabled` gates MCP tool eligibility."
- **Lead with the reader's question**, not the order you discovered things. Nobody needs the history of a decision to use its outcome.
- **Keep paragraphs short enough to survive one read.** If you have to re-read your own sentence, rewrite it.
- **Stay exact where exactness helps.** Full constraint names, file paths and error codes are what make writing usable. Don't simplify away something the reader needs to search for.
- **Explain jargon on first use, or cut it.** Words like "vocabulary", "contract drift" or "confirmed live" usually hide a simpler sentence.
