# Developing beamlynx-desktop

This repo just wires together a bundled pine-lang server and a static
beamlynx-ui export inside Electron -- there's no source code of its own to
iterate on beyond `src/main/`. Two different things you might be testing
call for two different workflows.

## Iterating on beamlynx-ui behavior (fast path)

Most UI changes -- including anything gated by `isDesktop()`
(`store/util.ts`) like the hidden version chip or the desktop-only
keybindings (`utils/keybindings.ts`) -- don't need Electron at all. Run
beamlynx-ui's normal dev server with the desktop runtime flag set, and test
in a regular browser tab with full hot-reload:

```sh
cd beamlynx-ui
NEXT_PUBLIC_DESKTOP=1 npm run dev
```

Don't set `NEXT_DESKTOP=1` here -- that's the *build-time* flag
(`next.config.js`) that switches on static `output: 'export'`, which
`next dev` doesn't need and which disables things like `middleware.ts`.
`NEXT_PUBLIC_DESKTOP` is the separate runtime flag `isDesktop()` actually
reads, and it works fine with a normal dev server.

This won't catch anything Electron-shell-specific (the native menu,
`Ctrl+W` racing the OS-level window-close accelerator, the JVM
server-startup path, packaging). For that, use the full run below.

## Running the real Electron shell

Needed for: the startup sequence in `src/main/index.ts`, the native `Menu`
(`buildMenu()`), the bundled-server process handling
(`src/main/server-process.ts`), or anything in `electron-builder.yml`.

You need Node 22 or later (`.nvmrc` says which). Electron 44 can't
install itself with Node 20. Since Electron 42, `npm install` no longer
downloads the Electron binary. The first `npm start` downloads it, or run
`npx install-electron --no` to get it up front.

One-time (or after a `pine-lang`/`beamlynx-ui` pull), stage both bundled
pieces:

```sh
./scripts/stage-server.sh              # copies pine-lang's jpackage output into resources/server/
./scripts/build-ui-export.sh           # builds beamlynx-ui's static export into resources/ui/
./scripts/stage-docs.sh                # copies src/main/mcp/pine-reference/*.md (hand-maintained, see its README.md) into resources/docs/, for the MCP server's get_pine_doc tool and the docs it pushes inline on a parse error
```

Then:

```sh
npm run build   # tsc, compiles src/main + src/preload to dist/
npm start        # tsc build + `electron .`
```

`build-ui-export.sh` is a full static Next build -- rerun it after every
beamlynx-ui change you want reflected, which is slow for iteration. To skip
that, point the Electron window at a live `next dev` server instead of the
staged static export:

```sh
# terminal 1
cd beamlynx-ui && NEXT_PUBLIC_DESKTOP=1 npm run dev

# terminal 2 (still needs resources/server staged once, from above)
cd beamlynx-desktop
BEAMLYNX_DEV_UI_URL=http://localhost:3000 npm start
```

This gives you the real Electron shell (menu, window, keybinding-vs-menu
interaction) with UI hot-reload. `BEAMLYNX_DEV_UI_URL` is dev-only -- a
packaged build never sets it, so it always falls back to loading the staged
static export (see `src/main/index.ts`).

## Running next to the installed app

A dev build (`npm start`) can run while the installed app is open, so you can
compare the two. Anything run from source is treated as a dev build: the
check is Electron's `app.isPackaged`.

|                  | Installed app                  | Dev build                          |
| ---------------- | ------------------------------ | ---------------------------------- |
| Pine server port | 33333                          | 43333                              |
| MCP control port | 33334                          | 43334                              |
| Data folder      | `<appData>/beamlynx-desktop`   | `<appData>/beamlynx-desktop-dev`   |
| MCP server name  | `beamlynx`                     | `beamlynx-dev`                     |

`<appData>` is `~/.config` on Linux and `~/Library/Application Support` on
macOS.

Saved connections are the exception: both copies read and write the same
`connections.json`, in the installed app's folder. Everything else in the
data folder is separate. That includes localStorage, so open tabs and
preferences don't carry over.

The dev build passes its port to the server as `PINE_PORT`. A pine-server
staged from a pine-lang older than that variable ignores it and never
answers on 43333. If startup times out, rebuild pine-lang's app-image and
re-run `./scripts/stage-server.sh`.

To let an AI agent use the dev build, register it as its own MCP server.
Settings > MCP in the dev build shows the exact command, under the name
`beamlynx-dev`. Each relay only talks to its own copy of the app.

## Before cutting a release

The CI workflow (`.github/workflows/ci.yml`) only builds an unpacked Linux
`dir` target as a config sanity check -- it doesn't produce something you'd
actually launch. Before tagging a release, do at least one real
`stage-server.sh` + `build-ui-export.sh` + `npm start` run locally per the
"Running the real Electron shell" section above, and once a release is
published, follow the desktop release checklist's step 7 in the root
`AGENTS.md` (download a real artifact, confirm a real DB connection + query
round-trip).
