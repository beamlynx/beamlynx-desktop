// Intentionally minimal: the UI talks to the bundled server via plain
// fetch() against http://localhost:33333 (see beamlynx-ui/store/client.ts),
// same as it does against a Docker-run server today. No privileged API
// surface is needed here unless/until the desktop shell exposes something
// the web UI genuinely can't do itself.
