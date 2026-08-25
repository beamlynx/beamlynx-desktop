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

## Before cutting a release

The CI workflow (`.github/workflows/ci.yml`) only builds an unpacked Linux
`dir` target as a config sanity check -- it doesn't produce something you'd
actually launch. Before tagging a release, do at least one real
`stage-server.sh` + `build-ui-export.sh` + `npm start` run locally per the
"Running the real Electron shell" section above, and once a release is
published, follow the desktop release checklist's step 7 in the root
`AGENTS.md` (download a real artifact, confirm a real DB connection + query
round-trip).
