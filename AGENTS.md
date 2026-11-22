# Beamlynx

This repo holds the whole app, in three folders. Each has its own `AGENTS.md` with the rules for working in it:

- `desktop/`: the Electron app. It bundles the other two.
- `ui/`: the interface (Next.js, TypeScript, MobX).
- `pine/`: the Pine language and its server (Clojure).

## See your change

A change isn't done when its tests pass. Run the app and look at it. `bin/beam` starts each part; it installs npm packages the first time. Pick by what you changed:

| You changed | Run | Then |
|---|---|---|
| The interface (`ui/`) | `bin/beam web` | Open http://localhost:3142. The page hot-reloads as you edit. |
| Something only the desktop app does (`desktop/`, or UI behind `isDesktop()`) | `bin/beam dev` | The app opens from source, on top of the UI dev server. |
| Pine (`pine/`) | `bin/beam api` | Send requests to http://localhost:33333/api/v1/. `pine/resources/example-requests/` has examples. For the canvas and results, use `bin/beam web` instead. |
| The tools AI agents call (`desktop/src/main/mcp/`) | `bin/beam dev` | Try the questions in `desktop/test/agent-cases/` through an agent connected to the dev app. |

**A database to try it on:**
- `bin/beam db` starts Postgres on localhost:5435 and MySQL on localhost:3308, both with the same tables and data. User, password and database are all `pine`. It needs Docker.
- `bin/beam sample-db` builds a small SQLite file, with no Docker. Only the desktop app (`bin/beam dev`) opens SQLite.

**If you are an agent and can't see a screen:** check the page with a browser tool if you have one (Playwright, a browser MCP), against `bin/beam web`. A new browser profile has empty local storage, so it shows a first-run app. To check a saved setting, set it in local storage before the page loads. If you can't look at all, say so in the PR, and say what the person should check by hand.

**Ports, so nothing collides:**

| Port | Used by |
|---|---|
| 3142 | the UI dev server |
| 33333, 33334 | the installed Beamlynx app (Pine server, agent control plane), and `bin/beam api` / `bin/beam web` |
| 43333, 43334 | the desktop app run from source (`bin/beam dev`) |

`bin/beam api` and `bin/beam web` can't run while the installed app is open, and say so. `bin/beam kill` stops stray dev processes, and never the installed app.

## Check your change

Before you open a PR, run what CI runs for the parts you changed:

```sh
bin/beam check            # everything
bin/beam check ui         # or one part: pine, ui, desktop
```

| Part | What runs |
|---|---|
| `pine` | the formatter's check, and the tests. MySQL and Postgres tests run only when `bin/beam db` is up (see `pine/AGENTS.md`). |
| `ui` | the type check and the unit tests |
| `desktop` | the TypeScript build and the unit tests |

CI also builds the app, and parses every example in the agents' Pine docs.

## Rules for the whole repo

- **A change that spans folders is one PR.** For example, a Pine feature, the UI that uses it, and the agent docs for it land together.
- **The three parts always ship together.** A release builds them from one commit, so the UI never meets an older Pine. Prefer the right shape for what the UI and Pine send each other over keeping the old one working.
- **Agent docs follow Pine in the same PR.** AI agents learn Pine from `desktop/src/main/mcp/pine-reference/`. A Pine change that an agent would write differently updates those files too. CI parses every example there with the Pine in `pine/`.
- **Every fix or feature gets a changelog entry**, under `## [Unreleased]`. A release only moves these entries; it doesn't write them. A contributor may leave it out: the maintainer writes or rewrites it when merging. There are two changelogs:
  - **`desktop/CHANGELOG.md` is the app's changelog,** for every change someone notices in the app, whichever folder it is in. The app's What's New is generated from it. Write for someone who knows the app only from the outside: what they notice, in one or two sentences, starting with a bold title.
  - **`pine/CHANGELOG.md` is the language's changelog,** for every Pine change, described in Pine's terms. A Pine change that someone would notice in the app gets an entry in both.
  - `ui/CHANGELOG.md` ended at 0.79.0. Don't add to it.
- **A PR shows what it does.** For a visible change, a screenshot or a short video. For a Pine change, a query and its result, before and after.
- **Suggest changes to the `AGENTS.md` files; don't make them on your own.** If you learn something the next person should know, say so in the PR description. Edit an `AGENTS.md` only when the change is asked for.
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

## Never store a database's address, only its hash

A database's address is its type, host, port and name, such as `postgres://localhost:5432/shop`. The code calls it the database key. It tells anyone who reads a file where someone's databases are.

- **Anything that needs to remember a database stores the key's SHA-256 hash** (`databaseKeyHash`): recipes, column widths, links, logs.
- **Never write the key, a host, a port or Pine's connection id** (`host:port:dbname`) to local storage, beamlynx.db, a log, usage stats, or anything sent off the machine.
- **One file keeps addresses:** the desktop's saved connections (`desktop/src/main/credential-store.ts`). It needs them to connect.

Why a hash: two people with the same database get the same hash. So a recipe can be shared for that database without showing where it is. A saved connection's id is random and local to one install: it shows nothing, but it can't be matched across installs.

A hash hides the address from someone reading the file. It is not a secret: anyone who guesses the address can hash it and compare. So never use the hash as a credential.

How each part applies it: `desktop/AGENTS.md` and `ui/AGENTS.md`.

## How to write

This applies to documentation, commit messages, changelog entries and pull request descriptions.

Follow plain-language principles (ISO 24495-1): readers should get what they need, find it easily, understand it on the first read, and be able to act on it. Plain does not mean vague. Keep the technical precision, and drop the density.

- **One idea per sentence.** If a sentence has two em-dashes or three clauses, it is carrying three ideas. Split it.
- **Say what something is before naming its mechanism.** "A saved connection has a flag the desktop app checks to decide which ones an AI agent can query" beats "`SavedConnectionMeta.mcpEnabled` gates MCP tool eligibility."
- **Lead with the reader's question**, not the order you discovered things. Nobody needs the history of a decision to use its outcome.
- **Keep paragraphs short enough to survive one read.** If you have to re-read your own sentence, rewrite it.
- **Stay exact where exactness helps.** Full constraint names, file paths and error codes are what make writing usable. Don't simplify away something the reader needs to search for.
- **Explain jargon on first use, or cut it.** Words like "vocabulary", "contract drift" or "confirmed live" usually hide a simpler sentence.
