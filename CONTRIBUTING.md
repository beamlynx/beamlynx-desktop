# Contributing

Thank you for helping. Bug reports, ideas and pull requests are all welcome.

## Before your first pull request

**Sign the [Contributor License Agreement](https://gist.github.com/ahmadnazir/d8eb4ad2c33318cab51f316f51b70aa5) (CLA).** A bot asks you to on your first pull request. It takes one click. Beamlynx is offered under the AGPL and under a commercial license, and the CLA is what lets your contribution be part of both. You keep the copyright to your work.

## Working on a change

1. **Run it.** `bin/beam web` shows the interface in your browser. `bin/beam dev` opens the desktop app. Both reload as you edit. The root [`AGENTS.md`](AGENTS.md) says which to use for which change, and where to get a database to try it on.
2. **Look at it.** Use the feature the way someone would, not only through its tests.
3. **Check it.** `bin/beam check` runs the tests and checks CI runs.

To find your way around:
- What each folder holds, and the rules that span them: [`AGENTS.md`](AGENTS.md)
- Working on Pine, the query language: [`pine/AGENTS.md`](pine/AGENTS.md)
- Working on the interface: [`ui/AGENTS.md`](ui/AGENTS.md)
- Working on the desktop app: [`desktop/AGENTS.md`](desktop/AGENTS.md) and [`desktop/DEVELOPMENT.md`](desktop/DEVELOPMENT.md)

## A good pull request

- Does one thing, and says what and why in its description.
- Shows the change. For anything you can see in the app, add a screenshot or a short video of it working. For a change to Pine, show a query before and after.
- Changes every folder it needs to. A Pine feature, the UI for it, and the agent docs for it belong in one PR.
- Passes CI.

You don't need to edit a `CHANGELOG.md`, but a line is welcome. The maintainer writes or rewrites it when merging.

## Reporting a security problem

Please don't open a public issue. Write to contact@grephyte.com.
