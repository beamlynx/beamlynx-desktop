export interface ChangelogItem {
  // A short, skimmable phrase naming what changed -- the thing a user reads
  // when scanning the list without stopping. Kept required so every entry
  // has one instead of only the ones someone remembered to write.
  title: string;
  // The fuller explanation: why it changed, how to use it, or what exactly
  // broke. Optional -- a title like "Dark mode" needs nothing more under it,
  // and repeating the title as a one-line "description" would just be noise.
  description?: string;
  example?: string;
}

export interface ChangelogVersion {
  version: string;
  date: string;
  added?: ChangelogItem[];
  changed?: ChangelogItem[];
  removed?: ChangelogItem[];
  fixed?: ChangelogItem[];
  security?: ChangelogItem[];
  breaking?: ChangelogItem[];
}

export const CHANGELOG: ChangelogVersion[] = [
  {
    version: '0.53.0',
    date: '2026-08-28',
    added: [
      {
        title: 'Zen mode',
        description:
          "A graph-only, distraction-free view (New Layout) that hides the header, tab strip, and Results, and turns auto-run off for as long as it's on (restored to whatever it was set to once you exit). Command palette only for now, no dedicated key.",
      },
      {
        title: 'Settings keyboard shortcut',
        description: 'Ctrl/Cmd+Shift+, toggles Settings open and closed, matching the gear icon.',
      },
      {
        title: 'A "Reconnect" action for a dead database connection',
        description:
          "Shown next to the connection label in the header whenever a tab's assigned database connection isn't live (e.g. the database wasn't running yet when the app started). Previously the only way to retry was switching tabs or reloading the whole app.",
      },
    ],
    changed: [
      {
        title: 'Ctrl/Cmd+, now toggles Settings',
        description:
          "Matching Slack's and most native Mac apps' Preferences convention, instead of the SQL panel. Ctrl/Cmd+. still toggles the Pine panel; Ctrl/Cmd+Shift+. now toggles the SQL panel.",
      },
      {
        title: 'Settings in New Layout is now a docked panel on the left',
        description:
          'Spans the full height (tab strip included) and stays open across tab switches, instead of living inside whichever tab was active when it was opened. No longer closes on Escape.',
      },
    ],
    fixed: [
      {
        title: "Canvas text didn't scale with the Text Size setting",
        description:
          'Node labels, chips, and toolbars now scale with Text Size (previously only the rest of the app did) and are larger at every size to begin with. The keybinding legend at the bottom-left of the canvas is now bigger and shows each shortcut key in bold accent color.',
      },
      {
        title: 'Settings floated on top of the canvas',
        description:
          "It no longer opens as a floating modal on top of the canvas in New Layout, so it never covers the canvas or results while you tune a change against them. Changing Text Size while the Appearance panel is open no longer reflows the panel itself. Its border and edges now match Canvas's own pane.",
      },
    ],
  },
  {
    version: '0.52.0',
    date: '2026-08-25',
    added: [
      {
        title: 'Appearance settings',
        description:
          'Three built-in themes (Light, Dark, Sepia), each with its own coordinated colors rather than a shared palette with a swappable accent. Picking one also determines light/dark behavior for the editor and canvas.',
      },
      {
        title: 'Separate Interface and Code fonts',
        description:
          "Interface font (System, Inter, IBM Plex Sans) and Code font (IBM Plex Mono, JetBrains Mono, Fira Code, System Monospace) are now independent choices, replacing one shared monospace-only font setting. Fira Code's ligatures now actually render.",
      },
      {
        title: 'Text size',
        description:
          "Small/Medium/Large - scales the app's text and spacing without resizing panels or the canvas.",
      },
    ],
    changed: [
      {
        title: '"Toggle Theme" cycles through all three themes',
        description: 'Previously switched between two.',
      },
      {
        title: 'Canvas keyboard navigation between tables now wraps around',
        description:
          'Arrow keys (or j/k) now wrap from the last table back to the first instead of stopping there.',
      },
    ],
    fixed: [
      {
        title: 'Trackpad two-finger scroll now pans instead of zooms',
        description:
          "In both the classic graph and canvas mode, matching the Miro/Figma convention. The classic graph's mouse controls also now match canvas mode's: right-click drags the canvas, left-click drags a node or rubber-band-selects.",
      },
    ],
  },
  {
    version: '0.51.2',
    date: '2026-08-23',
    changed: [
      {
        title: 'Consistent spacing around Canvas/Results',
        description:
          'One consistent 8px gap on all sides and between the two panes, instead of a slightly different, unexplained width for the pane divider (10px) versus the surrounding margins (8px), and no gap at all at the bottom.',
      },
    ],
    fixed: [
      {
        title: 'Desktop update notification said "restart" twice',
        description:
          'The message and the button both said it, and the "Restart Now" button had no visible border or fill, reading as plain text rather than something to click.',
      },
    ],
  },
  {
    version: '0.51.1',
    date: '2026-08-23',
    changed: [
      {
        title: 'Connection color moved to Settings',
        description:
          'Set from Settings > Database Connections (click its status dot), alongside renaming and MCP access, instead of from the top-left connection picker -- that dot is now just a status indicator.',
      },
      {
        title: 'Updates modal shows a title for each change',
        description:
          'A short title first, with its fuller explanation (when there is one) underneath -- easier to skim than a flat bullet list.',
      },
      {
        title: 'New keybindings for the Pine/SQL panel',
        description: 'Ctrl/Cmd+. for Pine and Ctrl/Cmd+, for SQL, replacing Ctrl/Cmd+Shift+E/S.',
      },
      {
        title: 'Canvas filters compose as separate where: steps',
        description:
          'Each filter is now its own where: step instead of joining a comma-separated list on one shared where: clause. Multiple filters on the same table still combine with AND, same as before.',
      },
    ],
    fixed: [
      {
        title: 'Table colors disappearing when the SQL panel opened',
        description:
          "Even though the results on screen hadn't gone stale -- opening the panel compared the newly-shown SQL text against the last-run Pine expression and always found a mismatch.",
      },
      {
        title: 'Auto-run not firing while the SQL panel was open',
        description:
          "A canvas gesture's own auto-run was gated on the Pine panel specifically being shown, rather than on canvas mode being active.",
      },
    ],
  },
  {
    version: '0.51.0',
    date: '2026-08-23',
    added: [
      {
        title: 'Canvas-first two-pane layout',
        description:
          'Canvas and Results, side by side or stacked, on by default for new sessions. Switch back to the classic sidebar layout any time from the header, Settings, or the command palette.',
      },
      {
        title: 'Auto-run in canvas mode',
        description:
          "The query now runs automatically after each canvas edit instead of waiting for Run. Toggle it off from Settings or the command palette if you'd rather run explicitly.",
      },
      {
        title: 'Pine/SQL text panel in the new layout',
        description:
          'An optional panel next to the canvas for hand-editing alongside point-and-click use (Ctrl+Shift+E for Pine, Ctrl+Shift+S for SQL).',
      },
      {
        title: "Pipe '|' as a second join shortcut",
        description:
          'Now also opens the join picker in canvas mode, alongside i -- a join is "pipe a new table onto this one".',
      },
      {
        title: 'Comma behaves like Enter in pickers',
        description:
          "In canvas mode's select/order/group/join pickers, a comma-separated list of columns no longer needs a keypress between each one.",
      },
      {
        title: 'Standard undo/redo shortcuts in canvas mode',
        description:
          'Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z, and Ctrl+Y now undo/redo in canvas mode too, alongside u/Shift+U.',
      },
      {
        title: 'Remove any table from the canvas',
        description:
          "Not just the last one added. If another table's join was relying on the removed one implicitly, it now resolves against whatever's left instead -- if that connection isn't real, it shows the existing dashed/warning-colored styling used for any other join the server can't resolve cleanly.",
      },
      {
        title: 'Resizable Pine/SQL panel',
        description:
          'Drag the divider between it and the canvas, instead of living with a fixed size.',
      },
      {
        title: 'Browser-style tab switching',
        description:
          "Ctrl/Cmd+Tab and Ctrl/Cmd+Shift+Tab move between tabs, matching a browser's own tab switching (Ctrl+PageDown/PageUp also work). Desktop app only -- a real browser already owns these for its own tabs.",
      },
      {
        title: 'PINE/SQL toggle in the canvas toolbar',
        description:
          "Opens the same panel Ctrl/Cmd+Shift+E/S already did, so it's reachable without a keyboard shortcut.",
      },
    ],
    removed: [
      {
        title: 'Compact mode preference',
        description:
          'It only ever affected the classic sidebar layout, and no longer had any effect once the new Canvas-first layout became the default -- the new layout already switches to a stacked arrangement on small screens on its own.',
      },
    ],
    fixed: [
      {
        title: 'Canvas keyboard shortcuts freezing after a query ran',
        description:
          's/w/o/g/i/x/u stopped responding after any query ran, and stayed unresponsive until the page was reloaded.',
      },
      {
        title: 'Sidebar height overflowing its panel',
        description:
          'A height saved from an earlier resize could stretch the graph/results panel taller than the window, showing an unwanted scrollbar.',
      },
      {
        title: 'Wrong letter hint on the join action',
        description: 'It highlighted j, not i -- i is the actual shortcut for it.',
      },
      {
        title: 'Checkpoint node missing active-shortcut hints',
        description:
          "Its action bar didn't show which letter shortcuts were active while it had keyboard focus, unlike a table node's.",
      },
      {
        title: 'Pine/SQL panel silently blocking canvas keybindings',
        description:
          'Opening it auto-focused its text editor, silently blocking every canvas keybinding until you clicked away from it once.',
      },
      {
        title: 'Auto-run delay cut from 500ms to 150ms',
        description:
          'The fixed wait after every canvas edit made it feel far slower than the query itself (typically a few milliseconds) -- 150ms is still enough to collapse a burst of rapid picks into one run.',
      },
      {
        title: 'Canvas crash on an inconclusive speculative build',
        description:
          'A gesture whose speculative build came back without a usable result (rather than failing outright) could crash the whole app instead of falling back gracefully.',
      },
      {
        title: 'Broken join rendered as if it were fine',
        description:
          'A join that no longer had a real column to connect on (for example, after deleting the table in between two others) rendered as a plain, confident-looking solid line instead of the dashed warning styling used for any other unresolved join -- and the table on the other end showed no columns at all. Both are now treated the same as any other unresolved join.',
      },
      {
        title: 'Canvas edits doing nothing while the SQL panel was open',
        description:
          'The graph and the SQL text both stayed frozen on whatever they showed before the edit. A session that reloaded with the SQL panel already open got stuck showing "Connecting…" forever for the same reason.',
      },
    ],
    changed: [
      {
        title: 'Canvas/graph mode switch moved into the graph panel',
        description:
          'It only ever applied there anyway; the header now only refers to which overall layout is active.',
      },
    ],
  },
  {
    version: '0.50.0',
    date: '2026-08-22',
    breaking: [
      {
        title: 'Requires pine-lang 0.39.0 or later',
        description:
          'The new connection refresh icon (below) needs its POST /api/v1/connections/:id/reindex endpoint.',
      },
    ],
    added: [
      {
        title: 'Refresh icon for live connections',
        description:
          'In Settings > Database Connections. Use it to pick up tables or columns added to the database after the connection was first opened, instead of restarting the server.',
      },
      {
        title: 'Connection rename',
        description:
          "An optional name field when adding it, and a pencil icon on its row in Settings > Database Connections afterward. Desktop app only, since that's the only place a connection's name is actually saved anywhere.",
      },
      {
        title: 'Keyboard control for canvas mode',
        description:
          "Move between nodes with the arrow keys or j/k, and use a single-letter shortcut for the highlighted node's operations: s select, w where, o order, g group, i join (or add the first table, from the start node), x delete, u/Shift+U undo/redo. The highlighted node is shown the same way as the query's current node, and its operations stay visible without needing to hover it. A checkpoint (a group:/limit: step) can now be navigated to and deleted the same way.",
      },
    ],
    fixed: [
      {
        title: 'Delete icon shifting position in the connections list',
        description:
          "It used to sit in a different column depending on whether that row also showed the refresh icon (only shown for a live connection), so rows didn't line up. It now sits in the same place on every row.",
      },
      {
        title: 'Desktop graph stuck on "Connecting…"',
        description:
          'It could get stuck showing that forever even once the connection was live. The very first query build for a tab, sent before its connection actually had a live pool yet, failed silently and nothing ever retried it once the connection came up. The connection reconnect step now asks for a fresh build once it succeeds.',
      },
      {
        title: 'MCP switch read as a general connection toggle',
        description:
          "Replaced with a small robot icon, lit when MCP access is on -- consistent with the row's other icon actions, and specific about what it actually controls.",
      },
    ],
    changed: [
      {
        title: '"Server version" label corrected in About',
        description:
          "It was always the connected pine-lang server's version, not this app's own. It also now shows the UI's own version, and, in the desktop app, the installed app's own version.",
      },
    ],
  },
  {
    version: '0.49.0',
    date: '2026-08-16',
    added: [
      {
        title: 'Settings page',
        description:
          'Opened from the gear icon next to the notification bell. It brings database connections, app preferences, and MCP setup into one place instead of scattered menus.',
      },
      {
        title: 'MCP support for the desktop app',
        description:
          'An AI agent like Claude Code can run queries directly against your saved connections. Turn it on per connection from Settings.',
      },
      {
        title: 'Database type field when adding a connection',
        description: 'Picking a type fills in its default port automatically.',
      },
      {
        title: '"Open Settings" and "New Database Connection" commands',
      },
    ],
    changed: [
      {
        title: '"Connections" renamed to "Database Connections"',
        description:
          'Now called that everywhere in the app, to leave room for a future connection to the Pine server itself.',
      },
      {
        title: 'Tabs for adding a connection',
        description:
          'Switch between typing in the fields and pasting a connection string, instead of an expandable section.',
      },
      {
        title: 'Onboarding screens removed',
        description:
          'The old Docker "Welcome" page and "Pine server is not running" page are gone. The app now goes straight to its normal view.',
      },
    ],
  },
  {
    version: '0.48.0',
    date: '2026-08-13',
    breaking: [
      {
        title: 'Requires pine-lang 0.38.1 or later',
      },
    ],
    added: [
      {
        title: 'Experimental interactive (graph) view',
        description:
          'Build Pine queries by clicking through tables in a graph instead of writing text -- toggle it from the header, next to the version number.',
      },
    ],
    changed: [
      {
        title: 'Unified visual design across the app',
        description: 'The "schematic/blueprint" look now spans everywhere, not just parts of it.',
      },
    ],
  },
  {
    version: '0.47.0',
    date: '2026-08-09',
    changed: [
      {
        title: 'Lazy per-tab connections',
        description:
          "Each tab now connects to its own database only when it becomes the active tab, instead of every tab eagerly following whatever connection was picked most recently. Opening the app no longer forces the connections picker open -- it silently reconnects the tab you were on. A tab whose connection isn't live yet shows a hollow (outline-only) dot in its own connection's color, filling in solid once connected.",
      },
    ],
    fixed: [
      {
        title: 'Graph click mistaken for a Tab keypress',
        description:
          'Clicking a graph node (e.g. expanding a variable/checkpoint container) stole focus into the Pine input and jumped the candidate-relation highlight to the first suggestion.',
      },
      {
        title: "Startup picker could change other tabs' connections",
        description:
          "Picking a connection from the auto-opened startup picker could open an unrelated new tab and silently change which connection *other*, already-open tabs appeared to be using -- both tabs and the toolbar were falling back to display whatever connection was last selected globally instead of each tab's own assigned connection.",
      },
      {
        title: '(Desktop) Restored tab with no saved-profile id',
        description:
          'It had nothing to reconnect from, so it silently never auto-connected -- it now falls back to resolving one from its connection id.',
      },
      {
        title: '(Desktop) Stale "active connection" checkmark',
        description:
          "The connections picker's checkmark could point at a stale profile after switching tabs silently reconnected a different one in the background -- it's now derived directly from the active tab's own connection, so it can't drift.",
      },
      {
        title: 'Connections wiped to "not connected" on every launch',
        description:
          "Every tab's assigned connection was silently cleared before pine-server (a fresh process each launch) had any chance to reconnect it -- restarting the app looked like every saved connection had been forgotten. A tab's assigned connection is no longer cleared just because it isn't live *yet*; liveness is now tracked separately (see lazy per-tab reconnect above).",
      },
      {
        title: 'Silent reconnect failures',
        description:
          'Failing to reconnect a saved profile (deleted/renamed on disk, or its DB unreachable) via the connections picker only logged to the console -- now shows the same connection-error banner as every other connection failure.',
      },
      {
        title: '(Desktop) Connection dot always shown as live',
        description:
          "The connections list/picker always showed a solid dot for every saved connection regardless of whether it actually had a live pool -- it was comparing pine's own connection id against the saved-profile id, two different id spaces that never matched. Not-yet-connected entries now correctly show as a hollow (outline-only) dot, matching the toolbar and tab indicators.",
      },
      {
        title: '(Desktop) Connection briefly showing its raw id',
        description:
          "On launch, a tab's connection briefly displayed as its raw `host:port` id instead of its saved name, before flashing to the real name once the saved-profile list finished loading -- looked like the connection had been renamed. Shows a neutral placeholder during that gap instead.",
      },
    ],
  },
  {
    version: '0.46.2',
    date: '2026-08-04',
    breaking: [
      {
        title: 'Requires pine-lang 0.37.2 or later',
      },
    ],
    fixed: [
      {
        title: 'Silent connection failures',
        description:
          'The toolbar just stopped showing a "connecting" spinner with no indication anything went wrong. A new error toast now surfaces the actual failure.',
      },
      {
        title: 'Restored connection wrongly shown as connected',
        description:
          "A previously-used connection restored from a past session could show as \"connected\" in the toolbar even when nothing was actually connected this session (pine-server's connection pools don't survive a process restart). Restored connections are now checked against the backend's live state before being trusted.",
      },
      {
        title: 'Disconnected state was a dead end',
        description:
          'When disconnected, the app now automatically opens the connections picker (or the add-connection form, if none exist yet) instead of leaving a dead "Not connected to database" label with no obvious next step.',
      },
    ],
  },
  {
    version: '0.46.1',
    date: '2026-08-03',
    fixed: [
      {
        title: "Playground's shared connection was deletable",
        description:
          'Deleting it from the connection picker broke the playground for everyone else using it; the delete action is now hidden (and refused as a backstop) in playground mode.',
      },
      {
        title: 'Changelog showing "-1 days ago"',
        description: 'A same-day entry showed that label when the local timezone is behind UTC.',
      },
    ],
  },
  {
    version: '0.46.0',
    date: '2026-08-03',
    added: [
      {
        title: 'Tabs restored on reload',
        description:
          'Pine/SQL text, input mode, and connection are now restored on reload instead of always starting from a single blank session.',
      },
      {
        title: 'Ctrl/Cmd+S saves the tab',
        description: "Downloads the active tab's Pine expression as a `.pine` file.",
      },
      {
        title: 'New command palette entries for connections',
        description: '"List Database Connections" and "New Database Connection".',
      },
    ],
    fixed: [
      {
        title: 'Tab key hijacked by the graph',
        description:
          "Pressing Tab while the graph had focus fell through to React Flow's own node/edge navigation instead of cycling through Pine completion candidates.",
      },
    ],
  },
  {
    version: '0.45.2',
    date: '2026-08-02',
    fixed: [
      {
        title: 'Notification bell showing the wrong color',
        description: 'It showed blue for unread updates instead of the intended warm accent.',
      },
    ],
  },
  {
    version: '0.45.1',
    date: '2026-08-02',
    fixed: [
      {
        title: '(Desktop) Saved connections missing color and name',
        description: "They weren't showing their color or proper name in the connection picker.",
      },
      {
        title: 'Connection dialog popping up unnecessarily',
        description:
          "It no longer pops up automatically when you already have saved or active connections to pick from -- it only does that when there's genuinely nothing to connect to yet.",
      },
    ],
    changed: [
      {
        title: 'Notification bell no longer shakes',
        description: "It still changes color when there's something new, just more subtly.",
      },
    ],
  },
  {
    version: '0.45.0',
    date: '2026-08-02',
    added: [
      {
        title: 'Desktop app, no Docker required',
      },
      {
        title: 'New desktop keyboard shortcuts',
        description:
          '`Ctrl/Cmd+K` for the Command Palette, `Ctrl/Cmd+T` for a new tab, `Ctrl/Cmd+W` to close a tab.',
      },
      {
        title: 'Update progress shown in-app',
      },
      {
        title: 'Saved connections remembered between sessions',
        description:
          "In the desktop app, encrypted using your device's own secure storage. The hosted/browser version is unchanged -- it still never stores credentials.",
      },
    ],
    changed: [
      {
        title: 'Server version label hidden in the desktop app',
        description: 'It has its own separate release notes.',
      },
    ],
  },
  {
    version: '0.44.0',
    date: '2026-07-31',
    added: [
      {
        title: 'Pine variables for multi-expression queries',
        description:
          'Write multi-expression queries and name/reuse an intermediate result with `|= name` in a new multi-expression editor. Variables and checkpoint (`group:`/`limit:`) results render in the graph as collapsible container nodes, with the same FK-relation handles and join-type-aware (solid/dashed) edges as regular tables.',
      },
      {
        title: 'Paste a Postgres connection string to connect',
        description:
          'The database connection dialog accepts a Postgres connection string (`postgresql://user:password@host:5432/database`) and parses it to fill in the host/port/user/password/database fields; manual entry stays the default, with pasting a string as a secondary, collapsible option. The connection string field is masked like a password so password managers can autofill it.',
      },
      {
        title: 'Remove a saved connection',
        description:
          "Click its trash icon to arm, click again to confirm -- backed by pine-lang's new DELETE endpoint.",
      },
    ],
    fixed: [
      {
        title: 'Typing lag in the Pine input',
        description:
          'Worsened with more expression blocks/variables, caused by unnecessary CodeMirror rebuilds on every keystroke.',
      },
      {
        title: 'Autocomplete flashed "Nothing found" while loading',
        description: 'It now shows a "Loading..." state instead.',
      },
    ],
    breaking: [
      {
        title: 'Requires pine-lang 0.37.0 or later',
      },
    ],
  },
  {
    version: '0.43.0',
    date: '2026-05-21',
    added: [
      {
        title: 'Per-tab connection picker',
        description:
          'Click the connection dot to switch which database that tab queries (by @Koziar).',
      },
    ],
    breaking: [
      {
        title: 'Requires pine-lang 0.36.0 or later',
      },
    ],
  },
  {
    version: '0.42.0',
    date: '2026-05-05',
    added: [
      {
        title: 'Per-session database connections',
        description:
          'Each tab can connect to a different database; queries from that tab always use its own connection.',
      },
      {
        title: 'Connection color indicators',
        description:
          'Each database gets a distinct color shown in the header and tab bar. Click the dot to pick a different color -- colors are saved across sessions.',
      },
    ],
    breaking: [
      {
        title: 'Requires pine-lang 0.35.0 or later',
      },
    ],
  },
  {
    version: '0.41.0',
    date: '2026-05-04',
    added: [
      {
        title: 'Copy Pine expression or SQL from the command palette',
      },
      {
        title: 'Copied SQL includes the Pine expression as comments',
        description:
          'Copying SQL, from the command palette or a SQL panel click, prepends each line of the Pine expression as `--` line comments above it.',
      },
    ],
  },
  {
    version: '0.40.0',
    date: '2026-04-20',
    added: [
      {
        title: 'Column hints for `update!`',
        description: 'Typing `u!` or `u! col = val,` suggests remaining assignable columns.',
      },
    ],
    breaking: [
      {
        title: 'Requires pine-lang 0.33.0 or later',
      },
    ],
  },
  {
    version: '0.39.1',
    date: '2026-03-30',
    added: [
      {
        title: 'Multi-table `update!` support',
        description: 'Assignments targeting different tables now run as separate UPDATE queries.',
      },
    ],
    fixed: [
      {
        title: 'Recursive delete followed non-FK heuristic relations',
        description:
          'It no longer does -- only tables with a real foreign key constraint are included in the generated DELETE statements.',
      },
      {
        title: '`update!` ignored table aliases on qualified columns',
        description:
          'It now correctly uses the table alias when a column is qualified (e.g. `c.name`).',
      },
    ],
  },
  {
    version: '0.39.0',
    date: '2026-02-18',
    fixed: [
      {
        title: 'Sticky column headers in results',
        description:
          'The table header now stays visible when scrolling through results (by @Koziar).',
      },
    ],
  },
  {
    version: '0.38.0',
    date: '2026-02-16',
    added: [
      {
        title: 'Table color decoration',
        description:
          'Expression segments and result columns are color-coded by table, to help visualize the relationship between them (collaboration with @Koziar).',
      },
    ],
    changed: [
      {
        title: 'Expression highlighting broke on `|` in string values',
        description:
          'Fixed by using the server-side prettified expression and ranges from the build endpoint instead of parsing the expression client-side.',
      },
    ],
    breaking: [
      {
        title: 'Requires pine-lang 0.31.0 or later',
      },
    ],
  },
  {
    version: '0.37.1',
    date: '2026-02-08',
    fixed: [
      {
        title: 'Bell animation shifted page scrollbars',
        description: 'Fixed by preventing layout shifts during the animation.',
      },
    ],
  },
  {
    version: '0.37.0',
    date: '2026-02-08',
    added: [
      {
        title: 'Resizable sidebar',
        description: "Drag the divider to adjust the sidebar's width (by @Koziar).",
      },
    ],
    changed: [
      {
        title: 'Better candidate node contrast in dark theme (by @Koziar)',
      },
    ],
  },
  {
    version: '0.36.0',
    date: '2026-01-09',
    added: [
      {
        title: 'Command palette',
        description: "Find and run commands, similar to VS Code's command palette.",
      },
    ],
  },
  {
    version: '0.35.1',
    date: '2025-12-26',
    added: [
      {
        title: 'Hints at the cursor position',
      },
      {
        title: 'Notification bell animates for unread updates',
      },
    ],
    changed: [
      {
        title: 'Pine operations no longer suggested',
        description: "They're excluded from suggestions, e.g. when pressing `Tab`.",
      },
    ],
    fixed: [
      {
        title: 'Cycling suggestions skipped the candidate node',
        description: 'Happened only when multiple nodes shared the same table name.',
      },
    ],
  },
  {
    version: '0.34.0',
    date: '2025-12-08',
    added: [
      {
        title: 'Bar chart rendering',
        description: 'Available when results have exactly two columns: one string, one number.',
      },
    ],
  },
  {
    version: '0.33.0',
    date: '2025-10-21',
    added: [
      {
        title: 'In-app changelog',
      },
    ],
  },
  {
    version: '0.32.0',
    date: '2025-10-19',
    added: [
      {
        title: 'Line and block comments in Pine',
        example: '-- This is a line comment\n/* This is a\n   multi-line\n   block comment */',
      },
    ],
    fixed: [
      {
        title: 'Graph shown despite an expression error',
      },
    ],
    changed: [
      {
        title: 'Pine/SQL toggle button',
      },
    ],
  },
  {
    version: '0.31.5',
    date: '2025-09-16',
    changed: [
      {
        title: 'Intro page examples updated for the playground',
      },
      {
        title: 'Share a query via URL',
        description:
          'The `?data=<encoded-object>` parameter takes a JSON-encoded object containing the expression.',
      },
    ],
  },
  {
    version: '0.31.2',
    date: '2025-09-11',
    changed: [
      {
        title: 'Common toggle button for Pine/SQL',
      },
    ],
  },
  {
    version: '0.31.1',
    date: '2025-09-11',
    changed: [
      {
        title: 'Update preview hidden by default',
        description: 'It shows when the inspect icon is clicked.',
      },
    ],
  },
  {
    version: '0.31.0',
    date: '2025-09-10',
    added: [
      {
        title: 'Confirmation modal before updating a record',
      },
    ],
    changed: [
      {
        title: 'Success messages removed',
      },
    ],
  },
  {
    version: '0.30.1',
    date: '2025-09-07',
    added: [
      {
        title: 'SQL mode support',
      },
    ],
  },
  {
    version: '0.29.1',
    date: '2025-08-30',
    security: [
      {
        title: "Updated values weren't being escaped",
      },
    ],
  },
  {
    version: '0.29.0',
    date: '2025-08-28',
    added: [
      {
        title: 'Forced server upgrade prompt when needed',
      },
    ],
    fixed: [
      {
        title: 'Error message missing on failed update',
      },
    ],
  },
  {
    version: '0.28.1',
    date: '2025-08-26',
    added: [
      {
        title: 'Edit rows directly in the results',
      },
      {
        title: 'Filter by any result value via context menu',
      },
    ],
    changed: [
      {
        title: 'Copy result values via context menu',
      },
    ],
    fixed: [
      {
        title: "Tab-reload keybinding wasn't working",
      },
      {
        title: "Cell values shouldn't be selectable",
      },
    ],
  },
  {
    version: '0.27.3',
    date: '2025-08-20',
    fixed: [
      {
        title: 'Related tables missing when clicking a table in the graph',
      },
      {
        title: 'Run keybinding now works on Mac',
      },
    ],
    changed: [
      {
        title: 'Connection monitor moved into the settings menu',
      },
      {
        title: 'Minimize/maximize button for the graph',
      },
      {
        title: 'Slimmer resizable divider',
        description: 'No icons are shown on it anymore.',
      },
    ],
  },
  {
    version: '0.27.0',
    date: '2025-08-19',
    added: [
      {
        title: 'Support for a `?query=<expression>` URL parameter',
      },
      {
        title: 'Graph shown in the secondary view alongside results',
      },
    ],
  },
  {
    version: '0.26.2',
    date: '2025-08-19',
    fixed: [
      {
        title: 'Disabled user authentication for the playground',
      },
    ],
  },
  {
    version: '0.26.0',
    date: '2025-08-18',
    added: [
      {
        title: 'Playground launched at playground.beamlynx.com',
      },
    ],
  },
  {
    version: '0.25.0',
    date: '2025-07-13',
    added: [
      {
        title: 'Welcome page for new users',
      },
      {
        title: 'Polling for server connection status',
      },
    ],
    changed: [
      {
        title: 'Sidebar default width increased to 400px',
      },
    ],
  },
  {
    version: '0.24.1',
    date: '2025-07-12',
    fixed: [
      {
        title: 'SQL view performance issue',
      },
      {
        title: 'Improved graph rendering',
      },
    ],
  },
  {
    version: '0.24.0',
    date: '2025-07-12',
    added: [
      {
        title: 'Autocomplete for the `where:` operation',
      },
    ],
    changed: [
      {
        title: 'Expression auto-prettifies after picking a table from autocomplete',
      },
    ],
    fixed: [
      {
        title: 'Mouse cursor incorrectly set to pointer',
      },
      {
        title: 'Download CSV button overlapped the Run button in compact mode',
      },
      {
        title: 'Autocomplete failed to show if opened too fast',
        description:
          'Added a fallback "Nothing found" completion so autocomplete always shows something.',
      },
    ],
  },
  {
    version: '0.23.0',
    date: '2025-07-07',
    added: [
      {
        title: 'Autocomplete for `select:` and `order:` operations',
      },
    ],
  },
  {
    version: '0.22.2',
    date: '2025-07-07',
    changed: [
      {
        title: 'Autocomplete no longer activates automatically',
      },
    ],
  },
  {
    version: '0.22.1',
    date: '2025-07-07',
    fixed: [
      {
        title: '`Tab` now shows the suggestions',
      },
      {
        title: 'First suggestion auto-selected',
      },
    ],
    changed: [
      {
        title: 'Expression prettifies after typing a pipe `|`',
      },
    ],
  },
  {
    version: '0.22.0',
    date: '2025-07-07',
    added: [
      {
        title: 'Download results as a CSV file',
      },
      {
        title: 'Autocomplete for pine operations and table names',
      },
    ],
    changed: [
      {
        title: 'Run keybinding changed to `Ctrl + Enter`',
      },
      {
        title: 'Run button moved into the text input',
      },
    ],
  },
  {
    version: '0.21.1',
    date: '2025-07-04',
    fixed: [
      {
        title: '`Tab` focus went to settings instead of the input',
      },
      {
        title: 'Improved graph colors in dark mode',
      },
    ],
    changed: [
      {
        title: 'Recursive delete queries now include the pine expressions',
      },
    ],
  },
  {
    version: '0.21.0',
    date: '2025-07-02',
    added: [
      {
        title: 'Run analysis templates',
      },
    ],
    fixed: [
      {
        title: 'Theme was set per tab instead of globally',
      },
    ],
  },
  {
    version: '0.20.1',
    date: '2025-07-01',
    fixed: [
      {
        title: 'SQL view re-rendered too often, hurting performance',
      },
    ],
  },
  {
    version: '0.20.0',
    date: '2025-07-01',
    added: [
      {
        title: 'Code editor for writing pine expressions',
      },
      {
        title: 'Dark mode',
      },
      {
        title: 'Vim mode',
      },
      {
        title: 'SQL syntax highlighting in dark mode',
      },
    ],
    fixed: [
      {
        title: "Escape key didn't return focus to the input",
        description:
          'This broke specifically after clicking another part of the UI with the mouse.',
      },
    ],
  },
  {
    version: '0.19.0',
    date: '2025-05-15',
    added: [
      {
        title: 'Button to evaluate Pine expressions',
      },
      {
        title: 'Clickable id column in results',
        description:
          "Clicking a row's id adds a where condition and limits the results to that row.",
      },
      {
        title: 'Responsive layout for smaller screens',
        description:
          'Below 1200px wide, the SQL query view is hidden so the main view has more room.',
      },
    ],
    fixed: [
      {
        title: 'Error handling for recursive delete queries',
      },
      {
        title: 'Graph rendered per table during recursive deletes',
      },
    ],
    changed: [
      {
        title: 'Graph updates as you type',
      },
      {
        title: 'Focus follows the candidate node',
      },
    ],
  },
  {
    version: '0.18.2',
    date: '2025-05-13',
    fixed: [
      {
        title: 'Correct column used in delete queries',
        description:
          "Delete queries now use the column from the previous join instead of defaulting to the table's first column.",
      },
    ],
  },
  {
    version: '0.18.1',
    date: '2025-05-09',
    added: [
      {
        title: 'Accurate version shown when the Pine server is offline',
        description: "Previously showed `latest` instead of the server's real version.",
      },
    ],
  },
  {
    version: '0.18.0',
    date: '2025-03-23',
    added: [
      {
        title: 'Clickable suggested columns',
        description:
          'Clicking a suggested select or order column in the selected node updates the expression.',
      },
    ],
    changed: [
      {
        title: 'Improved setup and connection UX',
        description: 'Setting up the Pine server and connecting to the database.',
      },
    ],
  },
  {
    version: '0.17.0',
    date: '2025-03-15',
    added: [
      {
        title: 'Clickable suggested nodes',
        description: 'Click a suggested node to select it.',
      },
    ],
  },
  {
    version: '0.16.0',
    date: '2025-03-10',
    added: [
      {
        title: 'View-mode icons for documentation, graph, and results',
      },
    ],
  },
  {
    version: '0.15.0',
    date: '2025-03-02',
    added: [
      {
        title: 'Resizable sidebar',
        description: 'Drag the divider to adjust its width.',
      },
      {
        title: 'Local storage for user preferences',
        description: 'Starting with the sidebar width setting.',
      },
    ],
  },
  {
    version: '0.14.0',
    date: '2025-02-26',
    added: [
      {
        title: 'Graph remembers moved node positions',
      },
    ],
  },
  {
    version: '0.13.0',
    date: '2025-02-09',
    added: [
      {
        title: 'Database connection monitor',
      },
    ],
  },
  {
    version: '0.12.0',
    date: '2025-02-02',
    added: [
      {
        title: 'Selected and suggested columns for order',
      },
    ],
    fixed: [
      {
        title: 'Graph not updating after running the expression',
      },
      {
        title: 'Graph disappearing on keypress',
        description: 'Any printable character hid the graph instead of leaving it visible.',
      },
      {
        title: 'Sidebar width on smaller screens',
        description: 'Adjusts automatically when the browser dev console is open.',
      },
    ],
  },
  {
    version: '0.11.0',
    date: '2025-01-11',
    added: [
      {
        title: 'More space for the graph',
        description: 'Rearranged the layout so the graph gets more room.',
      },
    ],
    fixed: [
      {
        title: 'Graph not re-rendering after selecting a suggested node',
      },
    ],
  },
  {
    version: '0.10.2',
    date: '2025-01-08',
    fixed: [
      {
        title: 'Suggested columns respect table aliases',
        example: 'company as c | document | select: c.id',
      },
    ],
  },
  {
    version: '0.10.1',
    date: '2025-01-07',
    added: [
      {
        title: 'Selected columns shown for tables',
      },
      {
        title: 'Suggested columns shown for the current table',
      },
    ],
  },
  {
    version: '0.9.0',
    date: '2024-10-25',
    added: [
      {
        title: 'Database connection support',
      },
    ],
  },
  {
    version: '0.8.0',
    date: '2024-10-19',
    added: [
      {
        title: 'Tabs for multiple sessions',
      },
      {
        title: 'Recursive deletes',
        example: "company | id='...' | delete:",
      },
    ],
  },
  {
    version: '0.7.1',
    date: '2024-09-22',
    fixed: [
      {
        title: 'A pipe always reformatted the whole expression',
        description:
          'Adding a `|` anywhere prettified the entire expression, so there was no way to add a pipe in the middle of one.',
      },
      {
        title: 'Non-printable keys leaked into the expression',
        description:
          "Pressing a non-printable key (e.g. an arrow key) while a candidate was selected in the graph typed that key's name into the expression instead of being ignored.",
      },
    ],
  },
  {
    version: '0.7.0',
    date: '2024-08-23',
    added: [
      {
        title: 'Show aliases for selected tables',
      },
    ],
    changed: [
      {
        title: 'Escape focuses the input',
      },
    ],
  },
  {
    version: '0.6.1',
    date: '2024-08-13',
    changed: [
      {
        title: 'Auto-prettify the expression on pipe entry',
      },
    ],
    fixed: [
      {
        title: 'Refocusing the input hid the results',
      },
    ],
  },
  {
    version: '0.6.0',
    date: '2024-08-02',
    breaking: [
      {
        title: 'Tab moves focus to the graph',
        description: '`Esc` or `Shift + Tab` moves focus back to the input.',
      },
      {
        title: 'The focused frame is highlighted with a border',
      },
      {
        title: 'Enter fetches results from the input',
      },
      {
        title: 'Enter selects the current candidate in the graph',
        description: 'Any other character brings focus back to the input.',
      },
    ],
  },
  {
    version: '0.5.0',
    date: '2024-07-31',
    breaking: [
      {
        title: 'Fetch results with `Ctrl + Enter`, not `Enter`',
      },
    ],
  },
  {
    version: '0.4.0',
    date: '2024-07-30',
    added: [
      {
        title: 'Support for `from: <alias>`',
        description: 'Sets the context table for joins.',
      },
    ],
  },
  {
    version: '0.3.2',
    date: '2024-07-26',
    changed: [
      {
        title: 'Syntax errors shown inline with the query',
      },
      {
        title: 'Removed deprecated code',
      },
    ],
  },
  {
    version: '0.3.1',
    date: '2024-07-22',
    changed: [
      {
        title: 'SQL query shown beside the Pine input',
      },
    ],
  },
  {
    version: '0.3.0',
    date: '2024-07-22',
    added: [
      {
        title: 'Copy the query on click',
      },
      {
        title: 'Support for ambiguous joins',
      },
    ],
    changed: [
      {
        title: 'Obsolete-version message when the server omits its version',
      },
      {
        title: '⏳ Fetching rows … message during query execution',
      },
      {
        title: 'Clerk no longer needed in development',
      },
      {
        title: 'SQL query indented (tabular-right)',
      },
    ],
  },
  {
    version: '0.2.0',
    date: '2024-07-11',
    added: [
      {
        title: 'Click a cell to copy its value',
      },
    ],
    fixed: [
      {
        title: 'Navigation broke when there were no candidates to select',
      },
      {
        title: 'Clicking a cell could duplicate rows or throw an error',
        description: 'This happened when moving focus away from the cell afterward.',
      },
    ],
  },
  {
    version: '0.1.1',
    date: '2024-07-08',
    changed: [
      {
        title: 'The graph now takes the full screen height',
      },
    ],
  },
];

export const LATEST_VERSION = '0.53.0';
