# Third-party notices

Beamlynx is licensed under the GNU AGPL-3.0 (see `LICENSE` and `LICENSING.md` at the repo's root). The desktop app includes the Pine server (`pine/`) and the interface (`ui/`) from the same repo, under the same license.

It also bundles libraries by others, each under its own license:

- The Pine server runs on a bundled Java runtime (Eclipse Temurin, GPL-2.0 with the Classpath Exception). It uses Clojure and other libraries under the Eclipse Public License, which `LICENSING.md` gives an additional permission for.
- The interface and the desktop app use npm packages, listed with their licenses in `ui/package-lock.json` and `desktop/package-lock.json`.
