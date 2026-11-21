# Beamlynx

The database client that knows your schema. Build queries on a canvas or in a short pipe language, and join tables without writing ON clauses. It works with PostgreSQL, MySQL and SQLite.

**Download:** [beamlynx.com](https://beamlynx.com), or the [latest release](https://github.com/beamlynx/beamlynx-desktop/releases/latest). On macOS: `brew install --cask beamlynx/tap/beamlynx`.

## What's in this repo

| Folder | What it is | Built with |
|---|---|---|
| [`desktop/`](desktop) | The desktop app. It starts the Pine server and shows the UI in a window. | Electron, TypeScript |
| [`ui/`](ui) | The app's interface: the canvas, the editor, the results. | Next.js, TypeScript, MobX |
| [`pine/`](pine) | Pine, the query language, and the local server that turns it into SQL and runs it. | Clojure |

A release builds all three from the same commit. The desktop app is the only thing released. Pine and the UI ship inside it.

Until November 2026 these were three repos: `beamlynx-desktop`, `beamlynx/pine-lang` and `beamlynx/beamlynx-ui`. Their histories are kept here. Old commit messages name their PRs in full, such as `beamlynx/pine-lang#158`.

## Working on it

- Running the app from source: [`desktop/DEVELOPMENT.md`](desktop/DEVELOPMENT.md)
- Pine's grammar, tests and formatting: [`pine/AGENTS.md`](pine/AGENTS.md)
- The UI's conventions: [`ui/AGENTS.md`](ui/AGENTS.md)
- Releasing: [`RELEASING.md`](RELEASING.md)

## License

Beamlynx is open source under the [GNU AGPL-3.0](LICENSE). A commercial license is available too. [`LICENSING.md`](LICENSING.md) explains both. The name and logo are covered by [`TRADEMARKS.md`](TRADEMARKS.md).

Contributions are welcome: see [`CONTRIBUTING.md`](CONTRIBUTING.md).
