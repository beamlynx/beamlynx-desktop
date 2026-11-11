import { makeAutoObservable, observable, reaction, runInAction } from 'mobx';
import { TOTAL_BARS } from '../constants';
import { DefaultPlugin } from '../plugin/default.plugin';
import { EvaluateOptions } from '../plugin/plugin.interface';
import { csvCell } from '../utils/csv';
import { mayChangeData, withoutDescribe } from './canvas/pine-text';
import { formatSql } from '../utils/formatSql';
import { shouldShowTableColors } from './table-colors.util';
import { CanvasStore } from './canvas/canvas.store';
import { elementLabel, JsonPeek, panelPeekTarget, peekExpression, peekOutcome } from './canvas/json-peek';
import { probeBuild, probeEval } from './canvas/probe';
import {
  buildDeleteScript,
  DeleteOutcome,
  runDeleteScript,
  runTraversal,
  TraversalNode,
  TraversalState,
  traversalClient,
  TraversalVerb,
} from './canvas/traversal';
import {
  AccessPolicyRule,
  AppliedAccessPolicy,
  ColumnPolicy,
  Ast,
  ConnectionInfo,
  effectiveAccessPolicy,
  effectiveAccessPolicyRules,
  Hints,
  HttpClient,
  JsonPathStep,
  Operation,
  Response,
  SqlJoinHint,
  SqlSchemaResponse,
  SqlToPineResponse,
  TableAlias,
  VariablesReport,
} from './client';
import { getUserPreference, setUserPreference, STORAGE_KEYS } from './preferences';
import { debounce } from './util';
import { cursorAfterReformat, offsetOf, pastSpaceAfterPipe, sameApartFromWhitespace } from '../utils/cursor';
import { captureUsage } from '../utils/usage-stats';
import type { HiddenColumn, QuerySnapshot } from './investigations';

// The editor text split into blocks, and which block is the query a build
// works on: in store/blocks.ts, a module with no imports, so the canvas and
// values-block helpers can use them without importing this store.
import {
  blocksForBuild,
  blockTitle,
  blocksToRun,
  cursorForBuild,
  findActiveBlock,
  findActiveQueryBlock,
  isValuesBlock,
  splitExpressions,
} from './blocks';
export { blocksForBuild, findActiveBlock, findActiveQueryBlock, isValuesBlock, splitExpressions };

// Canvas is not a distinct mode here - it's the only renderer 'graph' has
// (the classic node-graph widget, GraphBox, was removed). See
// components/Session.tsx's MainView.
export type Mode = 'documentation' | 'graph' | 'result' | 'monitor';

export type Theme = 'light' | 'dark';

export type InputMode = 'pine' | 'sql';

/** Where converting the SQL panel's text to Pine stands. */
/**
 * How long SQL that is merely unfinished ("The SQL ends before the
 * statement does.") stays quiet before the status line says so. It is true
 * at every pause while typing, so it is shown only when the text stays that
 * way. A refusal (OFFSET, a function) is shown at once.
 */
export const SQL_UNFINISHED_QUIET_MS = 1500;

export type SqlConversion = {
  status: 'idle' | 'converting' | 'converted' | 'failed';
  /** Why it failed, from pine-lang: "Line 3: OFFSET isn't in Pine." */
  message: string;
  /** How the Pine differs from the SQL without changing the rows. */
  warnings: string[];
};

export type Row = { [key: string]: any };

/**
 * One block's part of a Run that ran more than one block. Its result lives in
 * a session of its own, whose expression is the blocks up to this one, so
 * the results grid can show it, and edit its cells, like any tab's.
 * `waiting` until its turn, `skipped` when an earlier block failed or Stop
 * was pressed first.
 */
export type BlockRun = {
  index: number;
  text: string;
  session: Session;
  state: 'waiting' | 'running' | 'done' | 'skipped';
};

/** The tab's runId while Run works through blocks: each block's session has
 * its own, and Stop stops them (Session.stop). */
const BLOCK_RUN_ID = 'blocks';

/**
 * One column of a result, as the results grid needs it. `field` is the
 * column's index in the server's response, stringified - the key its values
 * sit under in every Row.
 */
export type ResultColumn = {
  field: string;
  headerName: string;
  editable: boolean;
};

/** One column of a table's primary key, and the field its value is under in each row. */
export type KeyColumn = { column: string; field: string };

export type ColumnMetadata = {
  colIndexToAliasLookup: Record<string, string>; // i.e. which table does the column belong to
  // The primary key columns of each table, in key order. A table without a
  // primary key has no entry, and its values can't be edited.
  aliasToKeyLookup: Record<string, KeyColumn[]>;
  colIndexToColumnLookup: Record<string, string>; // i.e. what is the column name for the column index
  // A key inside a JSON column (`companies[0].id`): the column, the path, and
  // the field of the hidden column holding each row's JSON type. Only for a
  // table whose rows can be edited; pine-lang sends no type otherwise.
  colIndexToPathLookup: Record<string, JsonPathTarget>;
  // How the access policy treats each column, when a policy was sent: what
  // the header marks and the right-click menu offers.
  colIndexToPolicyLookup: Record<string, ColumnPolicyInfo>;
  // For the elements of `unnest: data as e`, the field holding each row's
  // position of `e` in its array. Only when its table's rows can be edited.
  aliasToElementIndexField: Record<string, string>;
};

/**
 * How the access policy treats one result column, with the column's own
 * name. For a key inside a JSON column (isPath), that is the JSON column: a
 * rule can only name a whole column.
 */
export type ColumnPolicyInfo = ColumnPolicy & { column: string; isPath: boolean };

/** Where an edit of a JSON path cell is written. */
export type JsonPathTarget = { column: string; path: JsonPathStep[]; typeField: string };

const client = new HttpClient();

/**
 * ! A note on evaluation of the pine expressions !
 *
 * The expressions are evaluated in 2 ways:
 * - Build the expression i.e. get the AST and SQL
 * - Run the SQL
 *
 * The expressions are built for each character inserted i.e. if the pine
 * expression is updated, it is automatically being built using mobx reactions.
 *
 * The evaluation is explicit. A function is called to evaluate the expression.
 *
 * There used to be a second plugin here, picked by operation type: a `delete:`
 * on the end of an expression routed to a routine that walked child tables and
 * built a DELETE for each. It wanted to write to only parts of the session
 * (the SQL panel, not the results), which a plugin returning Row[] couldn't
 * express - so it wrote to the session directly and returned nothing.
 *
 * That's gone. Walking related tables is an action on the canvas now, with
 * state of its own (store/canvas/traversal.ts), so it no longer has to pretend
 * to be an evaluation. One plugin is left.
 */
export class Session {
  /**
   * Unique session id
   */
  id: string;

  /**
   * The tab this one was opened from, when it was opened as a detour rather
   * than by someone pressing "+" -- today, clicking a row of a traversal to
   * go and look at that table. Closing it goes back there (GlobalStore
   * .closeTab). Undefined for a tab opened on its own, which has nowhere
   * particular to return to.
   */
  openedFrom?: string;

  /**
   * Layout properties
   */
  isSmallScreen: boolean = false;

  /**
   * App states
   */

  /** Pine expression to be evaluated */
  expression: string = ''; // observable

  /** Input mode - pine or sql */
  inputMode: InputMode = 'pine';

  /** Per-session database connection id (pine's own id, e.g. `user@host:port:dbname`) */
  connectionId: string = '';

  /**
   * Desktop-only: which saved profile `connectionId` came from. A tab
   * reconnects through it after a restart, and the access policy is looked
   * up by it. Two saved connections can still share one pine id, when they
   * differ only in the password or the label. Blank in browser mode, where
   * there's no separate profile concept.
   */
  profileId: string = '';

  /** True while lazily (re)connecting this tab's assigned connection in the background. */
  connecting: boolean = false;

  /**
   * True for a restored tab until it has reconnected and its first build
   * has come back, or connecting has failed. Its builds before that fail
   * for want of a connection, and those errors say nothing about the query.
   */
  awaitingConnection: boolean = false;

  /** Whether the tab is still getting its connection, so its errors aren't shown yet. */
  get connectionPending(): boolean {
    return this.connecting || this.awaitingConnection;
  }

  /**
   * Set when a beamlynx://run link opened this tab (DeepLinkHandler.tsx).
   * The link's expression is put in the editor but not run: anyone can write
   * such a link, so the person checks the expression and the connection and
   * presses Run themselves. Shows LinkOpenedBanner until dismissed or until
   * the first run that succeeds. Not persisted.
   */
  openedFromLink: boolean = false;

  /** Database connection monitoring */
  monitor: boolean = false;
  connectionCountLogs: { time: string; count: number }[] = [];

  /** Expression/query that was last successfully evaluated (for coloring only after eval) */
  expressionAtLastEval: string = '';

  /** Result */
  loading: boolean = false; // observable
  // The id of the query running now, which Stop sends to the server. Null
  // when nothing that can be stopped is running.
  runId: string | null = null;
  columns: ResultColumn[] = [];
  // The field name - which is the index of the column (stringified) - and the
  // value is false The id fields are hidden by default but kept in the list of
  // columns so that finding the correct id of the row being updated is possible
  columnVisibilityModel: Record<string, boolean> = {};
  columnMetadata: ColumnMetadata = {
    colIndexToAliasLookup: {},
    aliasToKeyLookup: {},
    colIndexToColumnLookup: {},
    colIndexToPathLookup: {},
    aliasToElementIndexField: {},
    colIndexToPolicyLookup: {},
  };
  rows: Row[] = [];
  /**
   * How long the last run took, in milliseconds: from sending the query to
   * getting the rows back. Null when the rows on screen didn't come from a
   * run, such as an investigation's earlier step.
   */
  runMs: number | null = null;
  /**
   * The cap Pine put on the last run's rows because the expression set no
   * limit: of its own, or null. As many rows as this may mean there were
   * more. An agent's result says so (store/mcp-query.ts).
   */
  rowCap: number | null = null;
  /**
   * Which table each alias of the last run stands for, in order. Empty
   * against an older server. An agent's result lists them
   * (store/mcp-query.ts).
   */
  tableAliases: TableAlias[] = [];

  /** Mode - controls the main view */
  mode: Mode = 'documentation';
  message: string = '';

  /**
   * Flags to control the input mode
   */
  // TODO: make sure this is a readonly. This should only represent the state.
  // The actual focus should be done by calling the focus() function
  textInputFocused: boolean = false;

  /**
   * Bumped by the graph view when Tab is pressed while it (not the input)
   * has focus. PineInput watches this to refocus itself and run the exact
   * same "cycle through candidate relations" logic Tab already runs when
   * the input is focused -- so Tab always means the same thing, regardless
   * of where the graph happened to leave keyboard focus (React Flow makes
   * every node/edge natively tabbable, which is what this replaces).
   */
  tabCycleRequestCount: number = 0;

  /**
   * Response
   *  |_ Connection
   *  |_ Error
   *  |_ ErrorType
   *  |_ Ast
   *      |_ Operation
   *      |_ Hints
   *      |_ Query
   */
  response: Response | null = null; // observable
  connection: string = '-';
  error: string = '';
  errorType: string = '';
  /**
   * pine-lang's `error-type` from the last /eval, when it failed (for
   * example "write-refused"). Kept apart from errorType, which the build
   * reaction sets and which decides how a build error is shown.
   */
  evalErrorType: string = '';
  // The column the last /eval was refused for (evalErrorType "policy"), as
  // pine-lang names it. null otherwise. See store/investigations.ts.
  evalHiddenColumn: HiddenColumn | null = null;

  /** Ast */
  operation: Operation = { type: 'table' };
  ast: Ast | null = null; // observable
  /**
   * This tab's doc comment - the prose at the top of the expression,
   * already cleaned up by pine-lang (see its docs/comments.md). Empty when
   * the expression has no comment at the top, or against a server too old
   * to return one.
   */
  doc: string = ''; // observable

  /**
   * $variables (pine-lang's docs/variables.md): the latest successful build's
   * report of which variables the tab uses, which are used with `in`, and the
   * values written in its values blocks. Kept across failed builds the way
   * doc is. The canvas's Variables list reads it.
   */
  variablesReport: VariablesReport | null = null;
  /**
   * Whether the Pine text and the results show table colors: the preference
   * is on, there are rows, and the text is what ran. A computed value, so
   * what reads it re-renders when the answer changes, not on every keystroke.
   */
  get tableColorsShown(): boolean {
    return shouldShowTableColors(!!this.globalStore?.pineTableColorsEnabled, this);
  }

  /**
   * The SQL panel's text: what was typed there, or else the last build's
   * SQL, formatted, with or without the hidden columns as the preference
   * says. Formatted only when read, so a build costs nothing for it while
   * the panel is closed.
   */
  get query(): string {
    if (this.blockSql) {
      return this.globalStore?.showHiddenSqlColumns ? this.blockSql.withHidden : this.blockSql.withoutHidden;
    }
    return this.sqlPanelText ?? this.shownBuiltQuery(!!this.globalStore?.showHiddenSqlColumns);
  }
  /**
   * The SQL of every query block, while the SQL panel is open on a tab with
   * more than one; null otherwise. Each block's SQL is under a comment with
   * its first line. Read-only: converting SQL back to Pine takes one
   * statement, and would replace every block with it. Set by the reaction in
   * the constructor.
   */
  blockSql: { withHidden: string; withoutHidden: string } | null = null;
  set query(text: string) {
    this.sqlPanelText = text;
  }
  /** Typed in the SQL panel since the last build replaced it. null: the panel shows the built SQL. */
  private sqlPanelText: string | null = null;
  /**
   * SQL to Pine (pine-lang's docs/sql-to-pine.md). Typing in the SQL panel
   * converts the SQL, debounced, and the result replaces the tab's Pine, so
   * the canvas follows the SQL. This is what the status line under the SQL
   * editor shows.
   */
  sqlConversion: SqlConversion = { status: 'idle', message: '', warnings: [] };

  /**
   * What the SQL panel completes table and column names from, or null until
   * loaded (or when the server is too old to send it). See loadSqlSchema.
   */
  sqlSchema: SqlSchemaResponse | null = null;
  private sqlSchemaSeq = 0;
  /**
   * The expression the last successful conversion left the tab with. While
   * the tab's Pine is still exactly this, the SQL panel's text is what the
   * Pine came from, so a build doesn't replace it with the Pine's own SQL.
   * Once anything else changes the Pine, the panel shows its SQL again.
   */
  sqlTranslatedExpression: string | null = null;
  // Each conversion request's number. Only the latest one's answer is used,
  // so a slow answer about older text never replaces a newer one.
  private sqlConversionSeq = 0;
  /** Called on every edit of the SQL text. Debounced; see convertSql. */
  sqlEdited: () => void;
  // The last build's SQL, with and without the hidden columns, as pine-lang
  // sent it. `query` shows one of them, formatted, until it is edited by
  // hand in SQL mode.
  private builtSql: string = '';
  private builtSqlWithoutHidden: string = '';
  get builtQuery(): string {
    return formatSql(this.builtSql);
  }
  get builtQueryWithoutHidden(): string {
    return this.builtSqlWithoutHidden ? formatSql(this.builtSqlWithoutHidden) : this.builtQuery;
  }
  /** Currently selected text in the SQL editor, if any. Running a query while text is
   * selected runs only the selection instead of the full query. */
  querySelection: string = '';

  /** The lines selected in the Pine editor (0-based, inclusive), or null when
   * nothing is selected. Run then runs only the blocks the selection touches. */
  pineSelection: { from: number; to: number } | null = null;

  /** The blocks the last Run ran, when it ran more than one; empty otherwise.
   * The results pane shows a section for each. Replaced whole. */
  blockRuns: BlockRun[] = [];

  /** Set by Stop while Run works through blocks, so it starts no more. */
  private blockRunStopped = false;

  /**
   * The completion highlighted in the Pine editor's list, if it adds a step.
   * Its Pine shows as the tab's message.
   */
  candidate: { pine: string } | null = null;

  /**
   * Cursor position. Initialised so MobX observes it: the canvas draws the
   * query block it is in.
   */
  cursorPosition: { line: number; character: number } | undefined = undefined;

  /**
   * Cursor position used by the most recently resolved build. Lets
   * requestHints() skip firing when the cursor hasn't moved since — see its
   * doc comment for why that redundant rebuild is worth avoiding.
   */
  private lastHintsCursorPosition?: { line: number; character: number };

  /** True while a build request is in flight, so the autocomplete dropdown can
   * show a loading state instead of misreporting "Nothing found". */
  hintsLoading: boolean = false;

  /** All expression blocks split from the editor text (blank-line separated) */
  get expressions(): string[] {
    return splitExpressions(this.expression).map(b => b.text);
  }

  /** Counter to trigger hint regeneration on demand */
  hintsRequestedCounter: number = 0;

  /** Always true - Canvas is the only graph editor now, in every layout.
   * See GlobalStore.canvasActive. */
  get canvasActive(): boolean {
    return this.globalStore?.canvasActive ?? false;
  }

  /**
   * The rules that actually apply to this session's connected profile right
   * now: whichever named policy that connection has selected
   * (GlobalStore.accessPolicies, Settings -> Access Policy and Database
   * Connections' own picker) -- see effectiveAccessPolicyRules (client.ts)
   * for the exact gate. This session counts as the MCP caller iff it *is*
   * GlobalStore's dedicated MCP session (globalStore.mcpSessionId) -- the
   * one tab MCP-driven queries actually run in (see
   * GlobalStore.getOrCreateMcpSession) -- which always gets the assigned
   * policy while mcpEnabled is on; any other (human) tab instead follows
   * the connection's own applyPolicyToOwnQueries toggle (off by default --
   * the policy exists to gate the agent, not the owner), independent of mcpEnabled.
   * eval/build forward this verbatim to pine-lang, which redacts any column
   * no rule in it allows (see pine.access-policy). Always empty in browser
   * mode (no profileId, no policy concept there).
   */
  get accessPolicyRules(): AccessPolicyRule[] {
    const connections = this.globalStore?.connections as ConnectionInfo[] | undefined;
    const policies = this.globalStore?.accessPolicies ?? [];
    return effectiveAccessPolicyRules(
      connections?.find(c => c.id === this.profileId),
      policies,
      this.runsAsAgent,
    );
  }

  /**
   * The agent's queries evaluating in this tab right now
   * (GlobalStore.runMcpQuery raises it for exactly the length of each). A
   * count, not a flag: an agent can make calls in parallel, and the first to
   * finish must not unmark the others.
   */
  agentRunsInFlight = 0;

  /**
   * Whether what this tab sends now is an agent's: an investigation's tab
   * while one of its agent's queries is running. Everything it sends then is
   * enforced. Any other run in that tab is the user's own, and follows the
   * connection's "Also restrict my own queries", as in any other tab. The
   * agent's results stay masked in the timeline either way.
   */
  get runsAsAgent(): boolean {
    return this.isMcpSession && this.agentRunsInFlight > 0;
  }

  /**
   * What this session's requests carry: the rules above, enforced, or, on a
   * human tab of a connection agents can query, its policy to annotate the
   * results with (see effectiveAccessPolicy in client.ts). An agent's query
   * always enforces (runsAsAgent).
   */
  get accessPolicy(): AppliedAccessPolicy {
    const connections = this.globalStore?.connections as ConnectionInfo[] | undefined;
    return effectiveAccessPolicy(
      connections?.find(c => c.id === this.profileId),
      this.globalStore?.accessPolicies ?? [],
      this.runsAsAgent,
    );
  }

  /**
   * Whether this is GlobalStore's dedicated MCP session -- the one tab
   * agent-driven queries run in (GlobalStore.getOrCreateMcpSession). Derived,
   * never stored: a flag set at construction would have to be kept in step
   * with mcpSessionId, which is reassigned when the tab is closed and
   * recreated. Read by accessPolicyRules above and by evaluate() below.
   */
  get isMcpSession(): boolean {
    // Any investigation's tab (GlobalStore.agentSessionIds). A store without
    // investigations, like the tests' fakes, names one tab in mcpSessionId.
    const agentSessionIds: string[] | undefined = this.globalStore?.agentSessionIds;
    if (agentSessionIds) return agentSessionIds.includes(this.id);
    return !!this.globalStore?.mcpSessionId && this.id === this.globalStore.mcpSessionId;
  }

  /**
   * True for a tab whose expression came from an AI agent: the MCP tab.
   * evaluate() never lets such a tab change data, whoever presses Run.
   */
  get isAgentSession(): boolean {
    return agentSessionNeverWrites(this);
  }

  /** Evaluation plugins */
  plugins: { default: DefaultPlugin };

  /**
   * Lazily-created, cached CanvasStore for this session - see
   * getCanvasStore(). Not initialized eagerly (unlike `plugins`) since most
   * sessions never open Canvas mode.
   */
  private canvasStore: CanvasStore | null = null;

  /** Debounced trigger for auto-run - see notifyCanvasCommit(). */
  private autoRunTrigger: () => void;

  /**
   * Global store reference - theme, the connection list, the MCP session id,
   * and opening a new tab (see CanvasStore.openTraversalNode). Public because
   * the set of things read from it has outgrown "for accessing theme".
   */
  globalStore: any = null;

  constructor(id: string, globalStore?: any) {
    this.id = `session-${id}`;
    this.globalStore = globalStore;

    // traversalSignal excluded: an observable field hands back a Proxy of what
    // was assigned, so the object read back would never be identical to the
    // one handed to the walk -- which is exactly the bug that left a traversal
    // stuck on "walking" forever. Nothing renders it either.
    makeAutoObservable<Session, 'traversalSignal' | 'runSignal' | 'blockRunStopped'>(this, {
      traversalSignal: false,
      runSignal: false,
      blockRunStopped: false,
      // Each one holds a session, which observes itself.
      blockRuns: observable.ref,
      blockSql: observable.ref,
      pineSelection: observable.ref,
      // A result is only ever replaced whole (plugin/default.plugin.tsx),
      // never edited in place, so nothing needs to observe inside it. Deep
      // observation wrapped every row of every result in a Proxy on the way
      // in, and Result.tsx then copied them all back out with toJS - about
      // 1.6s for 100k rows before the grid drew anything. As refs, a new
      // result costs nothing to store and comes back as the plain arrays it
      // went in as.
      rows: observable.ref,
      columns: observable.ref,
      columnVisibilityModel: observable.ref,
      columnMetadata: observable.ref,
      // Replaced whole, and can hold thousands of tables.
      sqlSchema: observable.ref,
      // A build's answer, and what is taken from it: replaced whole on
      // every build, never edited in place. Deep observation wrapped every
      // hint in a Proxy on the way in (about 3 ms at 300 table hints, 12 ms
      // at 1,000), and every reader then read through them.
      response: observable.ref,
      ast: observable.ref,
      operation: observable.ref,
      // Replaced whole on every move (updateCursorPosition).
      cursorPosition: observable.ref,
      candidate: observable.ref,
    });

    /** Evaluation plugins */
    this.plugins = {
      default: new DefaultPlugin(this),
    };

    // Debounced so rapid canvas gestures (e.g. repeated clicks in a
    // still-open multi-select picker) collapse to one run, not one per
    // click - but kept short (150ms, not the 500ms this started at). The
    // actual query execution is fast (confirmed live: ~5ms once the /eval
    // request fires); a real human can't click distinct picker items faster
    // than ~150ms apart anyway, so this still collapses a genuine rapid
    // burst while no longer being the dominant, very perceptible source of
    // "auto-run feels slow" that 500ms was.
    this.autoRunTrigger = debounce(() => {
      if (!this.globalStore?.autoRunEnabled) return;
      if (this.loading) {
        // An eval from the previous gesture is still in flight - re-arm
        // rather than drop, so this gesture still gets its own run once
        // the current one resolves.
        this.autoRunTrigger();
        return;
      }
      // Never run an expression that changes data on its own. A where chip
      // added to narrow an update! would otherwise run it 150 ms later,
      // without anyone pressing Run.
      if (mayChangeData(this.expression)) {
        runInAction(() => {
          this.message = 'Auto-run skipped: this expression changes data. Press Run to run it.';
        });
        return;
      }
      // A canvas commit's source of truth is always session.expression
      // (Pine), never the SQL panel's text - forcePine runs that regardless
      // of session.inputMode, instead of silently no-oping (or, worse,
      // running stale/unrelated SQL text) whenever the SQL panel happens to
      // be the one showing. See EvaluateOptions.forcePine.
      void this.evaluate({ forcePine: true });
    }, 150);

    // Longer than auto-run's 150 ms: it is a request on every pause in
    // typing, and nobody reads the canvas mid-word.
    this.sqlEdited = debounce(() => {
      void this.convertSql();
    }, 300);

    // The SQL panel on a tab with several query blocks shows the SQL of
    // each (blockSql). Built only while the panel is open: one build per
    // block, on top of the canvas's own.
    let blockSqlSeq = 0;
    reaction(
      () => ({
        open: this.inputMode === 'sql',
        expression: this.expression,
        connectionId: this.connectionId,
        policy: this.accessPolicy,
      }),
      debounce(async ({ open, expression, connectionId, policy }) => {
        const seq = ++blockSqlSeq;
        const blocks = splitExpressions(expression);
        const chosen = blocksToRun(blocks, null);
        if (!open || chosen.length <= 1) {
          if (this.blockSql) runInAction(() => (this.blockSql = null));
          return;
        }
        const parts = await Promise.all(
          chosen.map(async index => {
            const head = `-- ${blockTitle(blocks[index].text)}`;
            try {
              const r = await client.build(blocksForBuild(blocks, index), undefined, connectionId, policy);
              if (r?.error || !r?.query) {
                const why = `-- Not built: ${(r?.error || 'no SQL').split('\n')[0]}`;
                return { withHidden: `${head}\n${why}`, withoutHidden: `${head}\n${why}` };
              }
              const without = r['query-without-hidden'] || r.query;
              // Each statement ends in one `;`. The formatter keeps one
              // that is already there.
              const statement = (q: string) => `${formatSql(q).replace(/;\s*$/, '')};`;
              return {
                withHidden: `${head}\n${statement(r.query)}`,
                withoutHidden: `${head}\n${statement(without)}`,
              };
            } catch (e) {
              const why = `-- Not built: ${e instanceof Error ? e.message : String(e)}`;
              return { withHidden: `${head}\n${why}`, withoutHidden: `${head}\n${why}` };
            }
          }),
        );
        if (seq !== blockSqlSeq) return;
        runInAction(() => {
          this.blockSql = {
            withHidden: parts.map(p => p.withHidden).join('\n\n'),
            withoutHidden: parts.map(p => p.withoutHidden).join('\n\n'),
          };
        });
      }, 200),
      { fireImmediately: true },
    );

    // Each build's number, and a way to cancel the one in flight. A build
    // can take longer than the pause before the next, and answers can
    // arrive out of order: only the latest build's answer is used, and
    // starting a build cancels the one before it. buildRequests counts the
    // changes that ask for a build, so a build only ends the loading state
    // when nothing has asked for another since it started.
    let buildSeq = 0;
    let buildInFlight: AbortController | null = null;
    let buildRequests = 0;

    /**
     * Mark hints as loading the moment a build is queued, not once it starts
     * running. The debounced reaction below only flips `hintsLoading` back to
     * false once its (debounced, then awaited) fetch actually completes, but
     * flipping it true has to happen synchronously here: the autocomplete
     * dropdown reads `isLoading()` once, when it opens, and only re-queries
     * on the next document change or hints update — not on every store
     * change — so by the time the debounced body below would set it, the
     * dropdown may already have rendered its (possibly empty) "Nothing
     * found" state from the stale hints.
     */
    reaction(
      () => ({
        expression: this.expression,
        trigger: this.hintsRequestedCounter,
      }),
      () => {
        buildRequests++;
        runInAction(() => {
          this.hintsLoading = true;
        });
      },
    );


    /**
     * Handle the expression and explicit hint requests
     * - Get the http response
     */
    reaction(
      () => ({
        expression: this.expression,
        trigger: this.hintsRequestedCounter,
      }),
      debounce(async ({ expression }) => {
        // Canvas is always mounted now (the classic node-graph widget,
        // GraphBox, was removed), and it keeps rendering a graph and needs a
        // fresh `ast` regardless of which text panel (if any) is open next
        // to it (New Layout's Pine/SQL panel is a hand-editing convenience,
        // not a replacement for the canvas) - so, unlike before Canvas mode
        // existed, a build always runs here even in SQL mode.
        runInAction(() => {
          if (expression.trim() === '' && this.mode === 'graph') {
            this.mode = 'documentation';
          } else if (expression.trim() !== '' && this.mode === 'documentation') {
            this.mode = 'graph';
          }
        });

        const seq = ++buildSeq;
        const requestsAtStart = buildRequests;
        buildInFlight?.abort();
        const controller = new AbortController();
        buildInFlight = controller;

        // response - use current cursor position (not watched, but always current)
        try {
          const blocks = splitExpressions(expression);
          const cursor = this.cursorPosition;
          const activeIdx = findActiveQueryBlock(blocks, cursor?.line);
          const activeExpressions = blocksForBuild(blocks, activeIdx);
          const adjustedCursor = cursorForBuild(blocks, activeIdx, cursor);
          const response = await client.build(
            activeExpressions,
            adjustedCursor,
            this.connectionId,
            this.accessPolicy,
            controller.signal,
          );
          if (seq !== buildSeq) return;
          runInAction(() => {
            this.response = response;
            // Only a build that produced an AST has fresh hints for this
            // cursor. A parse error still has one. A build that failed
            // outright, because the connection isn't back yet or the
            // database can't be reached, built nothing: recording its
            // cursor would make requestHints skip the rebuild that runs once
            // the database is back, and the canvas would stay stuck.
            if (response?.ast) {
              this.lastHintsCursorPosition = cursor;
            }
          });
        } catch (e) {
          // A newer build replaced this one: its error, if any, is the one to show.
          if (seq !== buildSeq) return;
          runInAction(() => {
            this.error = (e as any).message || 'Failed to build';
          });
        } finally {
          if (seq === buildSeq) buildInFlight = null;
          if (seq === buildSeq && requestsAtStart === buildRequests) {
            runInAction(() => {
              this.hintsLoading = false;
            });
          }
        }
      }, 200),
    );

    /**
     * Handle the response:
     * - connection name
     * - ast
     * - query
     * - operation
     * - error
     */
    reaction(
      () => this.response,
      response => {
        if (!response) return;

        runInAction(() => {
          // connection
          this.connection = response['connection-id'] || '-';

          // ast
          this.ast = response.ast;

          // doc
          //
          // Only off a build that actually succeeded. A parse failure comes
          // back with no `doc` at all, and this block renders directly above
          // the editor being typed in - taking `response.doc` unconditionally
          // would blank it on every keystroke that left the expression
          // momentarily unparseable. A *successful* build with no doc is
          // real (the comment was deleted), so that still clears it.
          //
          // `ast` is what makes this a build response specifically - only
          // build returns a doc at all. Today `this.response` is written
          // from exactly one place (the build reaction above), so this is
          // belt-and-braces: were an eval response ever assigned here, it
          // would carry neither `error` nor `doc` and would otherwise blank
          // the block on every run.
          if (!response.error && response.ast) {
            this.variablesReport = response.variables ?? null;
            this.doc = response.doc ?? '';
          }

          // query: what the SQL panel shows. With or without the hidden
          // columns, as the preference says; both are kept, so turning it
          // doesn't need another build. Formatted when read (see `query`).
          this.builtSql = response.query ?? '';
          this.builtSqlWithoutHidden = response['query-without-hidden'] ?? '';
          // Not while the Pine is a translation of the SQL panel's text:
          // that text is what the user wrote, and the source of the Pine.
          // Once it shows the Pine's SQL again, there is no conversion to
          // report.
          if (this.expression !== this.sqlTranslatedExpression) {
            this.sqlPanelText = null;
            this.sqlConversion = { status: 'idle', message: '', warnings: [] };
          }

          // operation
          this.operation = handleOperation(response);

          // error
          const { error, errorType } = handleError(response);
          this.error = error;
          this.errorType = errorType;

          // The first build on the tab's own connection ends the wait.
          if (this.awaitingConnection && !this.connecting && this.connectionId && errorType !== 'no-connection') {
            this.awaitingConnection = false;
          }

          // The database: unreachable, or back.
          if (errorType === 'database-unreachable' && !response.ast) {
            this.unreachable = error;
          } else if (response.ast && this.unreachable) {
            this.unreachable = null;
            this.globalStore?.databaseReachable?.(this.connectionId);
          }
        });
      },
    );

    /**
     * Handle the candidate
     * - Suggested Pine Expression
     */
    reaction(
      () => this.candidate,
      candidate => {
        if (!candidate) return;
        const { pine } = candidate;
        runInAction(() => {
          this.message = pine;
        });
      },
    );
  }

  private async pipeExpression(pine: string, overwriteLastOperation: boolean) {
    const parts = this.expression.split('|');
    const last = parts.pop();
    if (!overwriteLastOperation && last?.trim()) {
      parts.push(last);
    }
    parts.push(pine);
    const expression = parts.join('|');
    const prettified = await client.prettify(expression, this.connectionId);
    return prettified + '\n | ';
  }

  public async prettifyExpression(
    expression: string,
    appendPipe: boolean = false,
  ): Promise<string> {
    const blocks = splitExpressions(expression);
    if (blocks.length <= 1) {
      const prettified = await client.prettify(expression, this.connectionId);
      return appendPipe ? prettified + '\n | ' : prettified;
    }
    const cursor = this.cursorPosition;
    const activeIdx = findActiveQueryBlock(blocks, cursor?.line);
    const activeBlock = blocks[activeIdx];
    const prettifiedBlock = await client.prettify(activeBlock.text, this.connectionId);
    const result = appendPipe ? prettifiedBlock + '\n | ' : prettifiedBlock;
    // Reconstruct: blocks before active, prettified active, blocks after
    const before = blocks.slice(0, activeIdx).map(b => b.text);
    const after = blocks.slice(activeIdx + 1).map(b => b.text);
    return [...before, result, ...after].join('\n\n');
  }

  /**
   * Tidies every query in the tab: the Tidy command and button, for when
   * typing `|` doesn't tidy on its own (GlobalStore.autoTidy). Only spacing
   * and line breaks change, so the cursor keeps its place. A query that
   * doesn't parse, and a values block, are left as they are.
   */
  public async tidy() {
    const before = this.expression;
    const blocks = splitExpressions(before);
    // A query whose tidy changed more than whitespace keeps its own text:
    // Pine's prettifier drops a comment between steps.
    const tidyBlock = async (text: string) => {
      if (isValuesBlock(text)) return text;
      const tidied = await client.prettify(text, this.connectionId);
      return sameApartFromWhitespace(text, tidied) ? tidied : text;
    };
    let tidied: string[];
    try {
      tidied = await Promise.all(blocks.map(b => tidyBlock(b.text)));
    } catch {
      return; // The server is away: nothing changes.
    }
    const after = tidied.join('\n\n');
    // Typed into while the server answered: tidying now would undo it.
    if (this.expression !== before || after === before.trim()) return;
    const at = this.cursorPosition;
    const cursor = pastSpaceAfterPipe(
      after,
      cursorAfterReformat(before, after, at ? offsetOf(before, at.line, at.character) : before.length),
    );
    runInAction(() => {
      this.expression = after;
      this.pendingSelection = { anchor: cursor, head: cursor };
    });
  }

  public async prettify(appendPipe = false) {
    const expression = await this.prettifyExpression(this.expression, appendPipe);
    runInAction(() => {
      this.expression = expression;
    });
  }

  public appendAndUpdateExpression(string: string) {
    this.expression = this.expression + string;
  }

  /**
   * How many rows this tab's expression matches, counted by the server with
   * `| count:` on its last block. Never writes. Used before saving a cell
   * edit, so a save that would change more than one row is refused.
   */
  public async countRows(): Promise<number> {
    const blocks = this.expressions;
    if (blocks.length === 0) return 0;
    const last = blocks.length - 1;
    // A built-up expression ends in ` | `, ready for the next step
    // (pipeExpression). Left in, `| count:` would follow an empty step.
    const lastBlock = blocks[last].replace(/[\s|]+$/, '');
    const response = await client.eval(
      [...blocks.slice(0, last), `${lastBlock} | count:`],
      this.connectionId,
      this.accessPolicy,
      false,
    );
    if (response.error) throw new Error(response.error);
    const count = Number(response.result?.[1]?.[0]);
    if (!Number.isFinite(count)) throw new Error("Couldn't count the matching rows");
    return count;
  }

  public async pipeAndUpdateExpression(pine: string, overwriteLastOperation: boolean = false) {
    const expression = await this.pipeExpression(pine, overwriteLastOperation);
    runInAction(() => {
      this.expression = expression;
    });
  }

  public async setContext(alias: string) {
    const pine = `from: ${alias}`;
    const expression = await this.pipeExpression(pine, true);
    runInAction(() => {
      this.expression = expression;
    });
  }

  /**
   * Lazily creates (and caches) this session's CanvasStore, so it survives
   * Canvas being unmounted/remounted as `session.mode` flips between
   * 'graph' and 'result' (e.g. on every auto-run) - a fresh `new CanvasStore`
   * per mount would silently reset its undo/redo stacks and node positions.
   */
  public getCanvasStore(): CanvasStore {
    if (!this.canvasStore) {
      this.canvasStore = new CanvasStore(this);
    }
    return this.canvasStore;
  }

  /**
   * Called by CanvasStore after any gesture that commits a new,
   * backend-confirmed-valid expression (applyExpression/undo/redo) -
   * never wired to the raw `expression` write path, since hand-typed Pine
   * text can be mid-typing/invalid.
   */
  public notifyCanvasCommit() {
    this.autoRunTrigger();
  }

  /**
   * The traversal shown in the results pane, or null when the pane is showing
   * ordinary rows.
   *
   * A traversal IS a result -- counting the tables under one of yours answers
   * a question about the data, the same as a query does; it just wants a tree
   * rather than a grid. So it lives here next to `rows`/`columns` and renders
   * in the results pane, rather than floating over the canvas in a panel of
   * its own. Result.tsx already had the idea that one result can be drawn more
   * than one way (its bar-chart view); this is the same idea with a third
   * shape.
   *
   * Non-null is what tells the results pane to show a traversal instead of
   * rows -- no separate mode flag, and an ordinary run clears it
   * (DefaultPlugin), because running a query means the pane is showing that
   * query now.
   */
  traversal: TraversalState | null = null;

  /**
   * Cancellation for the in-flight walk. Excluded from observability (see the
   * makeAutoObservable call): an observable field hands back a Proxy of
   * whatever was assigned, so the object read here would never be identical to
   * the one handed to the walk. Nothing renders it either.
   */
  private traversalSignal: { cancelled: boolean } | null = null;

  /** Pause/cancel for an in-flight delete run. Non-observable, same reason. */
  private runSignal: { cancelled: boolean } | null = null;

  /**
   * Generation counter for traversals, so a late callback from a superseded
   * walk can tell it has been superseded and drop its result rather than
   * writing over the newer one. A number rather than object identity, for the
   * reason above.
   */
  private traversalSeq = 0;

  /**
   * Runs a traversal from the expression as it stands.
   *
   * The root is `session.expression`, unmodified. There's no rooting logic
   * here because the walk only ever *appends*: each node one level down is
   * its parent's expression plus one more join (see traversal.ts). Acting on
   * a node that isn't the end of the pipe is already handled the way every
   * other canvas gesture handles it - a `from:` committed into the expression
   * first (commitJoin's fromAlias) - so by the time this runs, the expression
   * already points where it should.
   */
  async startTraversal(verb: TraversalVerb) {
    // Nothing can follow describe: or references:, so the walk starts from the
    // query without them (see CanvasStore.openTraversePicker).
    const rootExpression = withoutDescribe(this.expression).trim();
    if (!rootExpression) return;
    this.getCanvasStore().closePicker();

    const signal = { cancelled: false };
    const seq = ++this.traversalSeq;
    this.traversalSignal = signal;
    runInAction(() => {
      // The results pane is showing this now, the same as it would show rows
      // after a run.
      this.mode = 'result';
      this.traversal = {
        verb,
        rootExpression,
        status: 'walking',
        nodes: [],
        depthCapped: false,
        script: null,
        queries: [],
        error: null,
        run: 'idle',
        outcomes: [],
        runFrom: 0,
      };
    });

    try {
      const result = await runTraversal(traversalClient, rootExpression, {
        connectionId: this.connectionId,
        signal,
        onNode: node =>
          runInAction(() => {
            if (this.traversal && this.traversalSeq === seq) {
              this.traversal.nodes = [...this.traversal.nodes, node];
            }
          }),
      });
      if (signal.cancelled) {
        runInAction(() => {
          if (this.traversal && this.traversalSeq === seq) this.traversal.status = 'cancelled';
        });
        return;
      }
      const plan =
        verb === 'delete'
          ? await buildDeleteScript(traversalClient, result.nodes, this.connectionId)
          : null;
      runInAction(() => {
        if (!this.traversal || this.traversalSeq !== seq) return;
        // Replaces the streamed list rather than appending to it: onNode
        // fires as each count lands, so the panel fills in while the walk
        // runs, but the finished list is post-order - the order the DELETEs
        // have to run in.
        this.traversal.nodes = result.nodes;
        this.traversal.depthCapped = result.depthCapped;
        this.traversal.script = plan?.script ?? null;
        this.traversal.queries = plan?.queries ?? [];
        this.traversal.status = 'done';
      });
    } catch (e) {
      runInAction(() => {
        if (!this.traversal || this.traversalSeq !== seq) return;
        this.traversal.status = 'failed';
        this.traversal.error = e instanceof Error ? e.message : 'Traversal failed';
      });
    }
  }

  /**
   * Opens one row of the traversal in a new tab. Each node's `expression` is
   * ordinary Pine - the walk builds them by appending joins - so this needs
   * no "traversal result" viewer, just a tab.
   */
  openTraversalNode(node: TraversalNode) {
    this.globalStore?.openExpressionInNewTab?.(node.expression);
  }

  /**
   * How the connection is named in the confirmation. Its label AND its host,
   * because a label alone is exactly what gets misread when two connections
   * are named something similar -- and "which database am I pointed at" is
   * the question the confirmation exists to answer.
   */
  get traversalConnectionLabel(): string {
    const connections = (this.globalStore?.connections ?? []) as {
      id: string;
      label?: string;
      dbHost?: string;
      dbName?: string;
    }[];
    const match = connections.find(c => c.id === this.profileId);
    if (!match) return this.connectionId || 'this connection';
    const where = [match.dbHost, match.dbName].filter(Boolean).join('/');
    return where ? `${match.label ?? match.id} (${where})` : (match.label ?? match.id);
  }

  /** Opens the confirmation. Deliberately a separate step from running. */
  requestTraversalRun() {
    if (!this.traversal || this.traversal.verb !== 'delete' || !this.traversal.script) return;
    // A walk cut off at the depth limit is an incomplete plan: the tables
    // below the limit have rows pointing at rows it would delete.
    if (this.traversal.depthCapped) return;
    runInAction(() => {
      if (this.traversal) this.traversal.run = 'confirming';
    });
  }

  dismissTraversalRun() {
    runInAction(() => {
      if (this.traversal && this.traversal.run === 'confirming') this.traversal.run = 'idle';
    });
  }

  /**
   * Runs the planned deletes, after the confirmation: it names the
   * connection with its host and lists every table and count, so the wrong
   * query or the wrong database shows up with the numbers in front of you.
   */
  async confirmTraversalRun() {
    const traversal = this.traversal;
    if (!traversal) return;
    // From the confirmation, or resuming: paused, or stopped on an error
    // (which leaves run back at 'idle' with runFrom part-way through).
    // Resuming is deliberately NOT gated behind the confirmation again -- it
    // was granted for this exact set of tables, and nothing about them has
    // changed, only how far through them we are.
    const resuming = traversal.run === 'paused' || traversal.run === 'failed';
    if (traversal.run !== 'confirming' && !resuming) return;

    const signal = { cancelled: false };
    this.runSignal = signal;
    runInAction(() => {
      traversal.run = 'running';
      // Drop the failure being retried, so the panel doesn't keep reporting a
      // node as failed while it is being attempted again. Successes stay:
      // they are what runFrom counts.
      const last = traversal.outcomes[traversal.outcomes.length - 1];
      if (resuming && last && 'error' in last) {
        traversal.outcomes = traversal.outcomes.slice(0, -1);
      }
    });

    await runDeleteScript(
      traversalClient,
      traversal.nodes,
      traversal.queries,
      this.connectionId,
      outcome =>
        runInAction(() => {
          if (this.traversal !== traversal) return;
          traversal.outcomes = [...traversal.outcomes, outcome];
          // Advance only past a success. A failure leaves runFrom pointing AT
          // the node that failed, which is where a resume has to start.
          if (!outcome.error) traversal.runFrom += 1;
        }),
      traversal.runFrom,
      signal,
    );

    runInAction(() => {
      if (this.traversal !== traversal) return;
      // Paused stays paused -- pauseTraversalRun already set it, and the loop
      // simply stopped asking for more.
      if (traversal.run !== 'paused') {
        traversal.run =
          traversal.runFrom >= traversal.nodes.length
            ? 'finished'
            : // Stopped short without being paused: the node at runFrom threw.
              'failed';
      }
    });
  }

  cancelTraversal() {
    if (this.traversalSignal) this.traversalSignal.cancelled = true;
    if (this.runSignal) this.runSignal.cancelled = true;
  }

  /**
   * Stops a delete run after the statement in flight, keeping its place.
   *
   * Not the same as cancelling the walk: nothing is undone, because nothing
   * can be -- each table's DELETE is its own statement and the ones that ran
   * are committed. Pausing only declines to start the next one, which is why
   * the button says Pause rather than Stop.
   */
  pauseTraversalRun() {
    if (this.runSignal) this.runSignal.cancelled = true;
    runInAction(() => {
      if (this.traversal && this.traversal.run === 'running') this.traversal.run = 'paused';
    });
  }

  closeTraversal() {
    this.cancelTraversal();
    runInAction(() => {
      this.traversal = null;
    });
  }

  /**
   * Stops the query this tab is running. The server stops the statement in
   * the database, and a write is rolled back. The run itself then ends with
   * "Query stopped.".
   */
  public async stop() {
    if (this.runId === BLOCK_RUN_ID) {
      this.blockRunStopped = true;
      await Promise.all(this.blockRuns.map(b => b.session.stop()));
      return;
    }
    const runId = this.runId;
    if (!runId) return;
    try {
      await client.cancel(runId);
    } catch (e) {
      runInAction(() => {
        this.error = `Couldn't stop the query: ${e instanceof Error ? e.message : String(e)}`;
      });
    }
  }

  /**
   * Why the database couldn't be reached on the last try, or null. Set by a
   * build answered with pine-lang's "database-unreachable", or by connecting
   * failing that way (GlobalStore.ensureSessionConnected). Cleared by the
   * next build that gets an answer. While set, the tab shows this one
   * reason, and GlobalStore tries again while the tab is open.
   */
  unreachable: string | null = null;

  /** Whether the database couldn't be reached on the last try. */
  get databaseUnreachable(): boolean {
    return this.unreachable !== null;
  }

  /**
   * Whether the last build drew nothing, so the canvas has no graph for the
   * expression: it failed outright (no AST, unlike a parse error), or the
   * database couldn't be reached. Not before the first build (ast is null).
   */
  get buildFailed(): boolean {
    return this.databaseUnreachable || (this.ast === undefined && this.expression.trim() !== '');
  }

  /** Builds the expression again, as it is. */
  public rebuild() {
    this.hintsRequestedCounter++;
  }

  /**
   * What Run does (the Run button, Ctrl+Enter, the Run Query command). With
   * one query block, or in SQL mode, it is evaluate(). With several, each
   * block runs in turn, top to bottom, and its result gets its own section
   * (blockRuns). Lines selected in the Pine editor narrow it to the blocks
   * they touch. A block that fails stops the ones after it, which may build
   * on it.
   *
   * Every other way a tab runs (canvas gestures, an agent's queries, a
   * preview) still calls evaluate(), which runs the last block. An agent's
   * tab does too: its one result is what the agent reads.
   */
  public async run() {
    // The SQL panel showing several blocks' SQL is read-only: Run runs their
    // Pine, as from the Pine panel.
    const sqlRun = this.inputMode === 'sql' && !this.blockSql;
    if (sqlRun || this.isAgentSession) return this.evaluate();
    const blocks = splitExpressions(this.expression);
    const chosen = blocksToRun(blocks, this.inputMode === 'sql' ? null : this.pineSelection);
    if (chosen.length <= 1) {
      const only = chosen[0];
      return this.evaluate({
        forcePine: true,
        ...(only === undefined ? {} : { expressions: blocksForBuild(blocks, only) }),
      });
    }

    const runs: BlockRun[] = chosen.map(index => {
      const session = new Session(`${this.id}-block-${index}`, this.globalStore);
      session.connectionId = this.connectionId;
      session.profileId = this.profileId;
      session.expression = blocksForBuild(blocks, index).join('\n\n');
      return { index, text: blocks[index].text, session, state: 'waiting' };
    });
    const setState = (run: BlockRun, state: BlockRun['state']) =>
      runInAction(() => {
        this.blockRuns = this.blockRuns.map(r => (r.index === run.index ? { ...r, state } : r));
      });
    this.blockRunStopped = false;
    runInAction(() => {
      this.blockRuns = runs;
      this.error = '';
      this.evalErrorType = '';
      this.evalHiddenColumn = null;
      this.traversal = null;
      this.mode = 'result';
      this.loading = true;
      this.runId = BLOCK_RUN_ID;
    });
    // Each block's evaluate() counts itself as a run.
    try {
      let failed = false;
      for (const run of runs) {
        if (failed || this.blockRunStopped) {
          setState(run, 'skipped');
          continue;
        }
        setState(run, 'running');
        await run.session.evaluate();
        setState(run, 'done');
        if (run.session.error) failed = true;
      }
    } finally {
      runInAction(() => {
        this.loading = false;
        if (this.runId === BLOCK_RUN_ID) this.runId = null;
        this.expressionAtLastEval = this.expression;
      });
    }
    return [];
  }

  public setPineSelection(selection: { from: number; to: number } | null) {
    const same =
      selection === this.pineSelection ||
      (selection && this.pineSelection && selection.from === this.pineSelection.from && selection.to === this.pineSelection.to);
    if (!same) this.pineSelection = selection;
  }

  public async evaluate(opts?: EvaluateOptions) {
    // An agent's tab never writes, whoever asked it to. runMcpQuery already
    // passes allowWrites: false, so for the MCP tab this is not what stops an
    // agent today -- it is what stops the next caller. Binding it to the
    // session means a future path into this tab that forgets the option
    // inherits the safe answer instead of silently inheriting writes
    // (allow-writes defaults to allowed server-side, for the person's own
    // editor). It also covers the person pressing Run on an agent's tab,
    // where the expression on screen is the agent's, not theirs.
    const effectiveOpts: EvaluateOptions | undefined = this.isAgentSession
      ? { ...opts, allowWrites: false }
      : opts;
    // An agent's runs are counted in runMcpQuery, which knows whether the
    // agent sent SQL.
    if (!this.isAgentSession) {
      captureUsage('query_run', { source: 'user', language: opts?.forcePine ? 'pine' : this.inputMode });
    }
    const result = await this.plugins.default.evaluate(effectiveOpts);
    // A run reaches the database on its own. If the last build didn't, say
    // because the database was down when the tab opened, build again now
    // rather than waiting for the next retry.
    if (this.buildFailed) {
      this.rebuild();
    }
    if (this.openedFromLink && !this.error) {
      runInAction(() => {
        this.openedFromLink = false;
      });
    }
    this.globalStore?.onSessionEvaluated?.(this);
    return result;
  }

  /**
   * Shows a result this tab had before, without running anything: an older
   * step of an investigation (store/investigations.ts). Setting the
   * expression rebuilds the canvas, as typing would; only a canvas gesture
   * runs a query on its own.
   */
  public showSnapshot(snapshot: QuerySnapshot) {
    runInAction(() => {
      this.expression = snapshot.expression;
      this.expressionAtLastEval = snapshot.expression;
      this.columns = snapshot.columns;
      this.rows = snapshot.rows;
      this.runMs = null;
      this.columnMetadata = snapshot.columnMetadata;
      this.columnVisibilityModel = snapshot.columnVisibilityModel;
      this.error = snapshot.error;
      this.evalErrorType = '';
      this.evalHiddenColumn = null;
    });
  }

  /**
   * Explicitly build an expression and return the AST.
   * This bypasses the reactive flow and is useful for imperative operations
   * like fetching hints for command palette options.
   *
   * Similar to evaluate() but only builds without executing.
   */
  public async build(expression: string): Promise<Ast> {
    const response = await client.build(
      [expression],
      this.cursorPosition,
      this.connectionId,
      this.accessPolicy,
    );
    return response.ast;
  }

  public setTextInputFocused(focused: boolean) {
    this.textInputFocused = focused;
  }

  public focusTextInput() {
    this.textInputFocused = true;
  }

  public blurTextInput() {
    this.textInputFocused = false;
  }

  public requestTabCycle() {
    this.tabCycleRequestCount++;
  }

  public setQuerySelection(text: string) {
    this.querySelection = text;
  }

  /**
   * A selection for the editor to apply the next time it takes this
   * session's expression, as offsets into the new text. Set together with
   * `expression` when a recipe is used, so its first value is selected (or,
   * in Vim mode, the cursor sits on it). PineInput clears it once applied.
   */
  pendingSelection: { anchor: number; head: number; focus?: boolean } | null = null;

  public setExpressionWithSelection(expression: string, selection: { anchor: number; head: number } | null) {
    this.pendingSelection = selection;
    this.expression = expression;
    this.textInputFocused = true;
  }

  public updateCursorPosition(line: number, character: number) {
    // The editor reports on every update, most of which don't move the
    // cursor. Only a move is a change: the canvas draws the block it is in.
    const at = this.cursorPosition;
    if (at && at.line === line && at.character === character) return;
    this.cursorPosition = { line, character };
  }

  /**
   * Put the cursor at the start of `line`, from outside the editor: the
   * canvas's strip picking a query block. The editor applies it as it does a
   * recipe's selection, now or when it next opens, without taking focus. The
   * session then builds the block the cursor is in.
   */
  public moveCursorToLine(line: number) {
    const lines = this.expression.split('\n');
    const offset = lines.slice(0, line).reduce((n, l) => n + l.length + 1, 0);
    this.cursorPosition = { line, character: 0 };
    this.pendingSelection = { anchor: offset, head: offset, focus: false };
    this.requestHints();
  }

  /**
   * The first value of a JSON column whose key is being typed in the Pine
   * panel, while its hints are open (Tab). Shown in the results pane like a
   * canvas picker's peek (see json-peek.ts). Null otherwise.
   */
  panelPeek: JsonPeek | null = null;
  private panelPeekKey = '';
  private panelPeekSeq = 0;

  /**
   * Peeks at the JSON column a key is being typed in at `offset` in the
   * editor's `text`, or stops peeking when `offset` is null or isn't in one. Runs
   * again only when the column changes, so typing the key runs no more
   * queries.
   */
  public async peekAt(text: string, offset: number | null) {
    const target = offset === null ? null : panelPeekTarget(text, offset);
    const key = target ? JSON.stringify(target) : '';
    if (key === this.panelPeekKey) return;
    this.panelPeekKey = key;
    const seq = ++this.panelPeekSeq;
    if (!target) {
      this.panelPeek = null;
      return;
    }
    const { context, prefix, candidates } = target;
    try {
      // The name before the first dot may be the elements of an `unnest:`
      // before the cursor, `e.`: the peek is then at an element. It is the
      // last guess, the one without an alias.
      const name = candidates[candidates.length - 1].column;
      const built = await probeBuild(`${prefix} | s: `, this.connectionId, context);
      if (seq !== this.panelPeekSeq) return;
      const unnests = built?.unnests ?? [];
      const unnest = unnests.find(u => u.alias === name);
      if (unnest) {
        const expression = peekExpression(prefix, null, name);
        const label = elementLabel(unnest, unnests.map(u => u.alias));
        const peek = { alias: name, ...label, expression };
        runInAction(() => {
          this.panelPeek = { ...peek, status: 'loading' };
        });
        const response = await probeEval(expression, this.connectionId, this.accessPolicy, context);
        if (seq !== this.panelPeekSeq) return;
        runInAction(() => {
          this.panelPeek = { ...peek, ...peekOutcome(response, name) };
        });
        return;
      }
      // Which guess names a JSON column: the server lists those after `unnest:`.
      let found: { base: string; alias: string; column: string } | undefined;
      for (const { alias, column } of candidates) {
        const base = alias ? `${prefix} | from: ${alias}` : prefix;
        const ast = await probeBuild(`${base} | unnest: `, this.connectionId, context);
        if (seq !== this.panelPeekSeq) return;
        const hint = ast?.hints.unnest?.find(h => h.column === column && (!alias || h.alias === alias));
        if (hint) {
          found = { base, alias: hint.alias, column };
          break;
        }
      }
      if (!found) {
        runInAction(() => {
          this.panelPeek = null;
        });
        return;
      }
      const { base, alias, column } = found;
      const expression = peekExpression(base, alias, column);
      const peek = { alias, table: alias, column, expression };
      runInAction(() => {
        this.panelPeek = { ...peek, status: 'loading' };
      });
      const response = await probeEval(expression, this.connectionId, this.accessPolicy, context);
      if (seq !== this.panelPeekSeq) return;
      runInAction(() => {
        this.panelPeek = { ...peek, ...peekOutcome(response, column) };
      });
    } catch (e) {
      if (seq !== this.panelPeekSeq) return;
      runInAction(() => {
        this.panelPeek = null;
      });
    }
  }

  public requestHints() {
    // Only needed when the cursor moved without a text change — e.g. clicking
    // or arrow-keying into an earlier segment, then pressing Tab — since the
    // build reaction above is keyed on `expression`, not cursor position, and
    // won't refire on its own. If the cursor hasn't moved since the last
    // build, hints are already fresh for it: skip the rebuild. Firing it
    // anyway would resolve to the same hints, and refill the open list with
    // them for nothing (PineInput's refreshCompletions).
    const { cursorPosition, lastHintsCursorPosition } = this;
    if (
      cursorPosition &&
      lastHintsCursorPosition &&
      cursorPosition.line === lastHintsCursorPosition.line &&
      cursorPosition.character === lastHintsCursorPosition.character
    ) {
      return;
    }

    // Increment counter to trigger the reaction
    this.hintsRequestedCounter++;
  }

  /**
   * Convert the SQL panel's text to Pine and put it in the tab, through the
   * canvas so it is one undo step (CanvasStore.applySqlTranslation). Runs
   * nothing. When the SQL doesn't convert, the Pine is left as it was and
   * the status line says why.
   */
  public async convertSql(): Promise<void> {
    const seq = ++this.sqlConversionSeq;
    const sql = this.query;
    if (sql.trim() === '') {
      this.sqlConversion = { status: 'idle', message: '', warnings: [] };
      return;
    }
    // Keep what the line says until the answer arrives, so it doesn't blink
    // out and back on every keystroke.
    this.sqlConversion = { ...this.sqlConversion, status: 'converting' };
    let result: SqlToPineResponse;
    try {
      result = await client.sqlToPine(sql, this.connectionId);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      result = {
        error: /^404\b/.test(message) ? 'This Pine server is too old to convert SQL.' : message,
      };
    }
    if (seq !== this.sqlConversionSeq) return;
    runInAction(() => {
      if (result.expression !== undefined && !result.error) {
        this.getCanvasStore().applySqlTranslation(result.expression);
        this.sqlTranslatedExpression = this.expression;
        this.sqlConversion = { status: 'converted', message: '', warnings: result.warnings ?? [] };
      } else {
        const failed: SqlConversion = {
          status: 'failed',
          message: result.error || 'The SQL could not be converted.',
          warnings: [],
        };
        if (result['error-type'] !== 'sql-parse-error') {
          this.sqlConversion = failed;
          return;
        }
        // Unfinished SQL: say nothing yet, and say it only if the text is
        // still this when the pause is over.
        this.sqlConversion = { status: 'converting', message: '', warnings: [] };
        setTimeout(() => {
          if (seq !== this.sqlConversionSeq) return;
          runInAction(() => {
            this.sqlConversion = failed;
          });
        }, SQL_UNFINISHED_QUIET_MS);
      }
    });
  }

  /**
   * Load the connection's tables and columns for the SQL panel's completion.
   * A failure (no connection, or a server without /sql-schema) leaves no
   * completion, never an error.
   */
  public async loadSqlSchema(): Promise<void> {
    const seq = ++this.sqlSchemaSeq;
    let schema: SqlSchemaResponse | null;
    try {
      schema = await client.sqlSchema(this.connectionId);
    } catch {
      schema = null;
    }
    if (seq !== this.sqlSchemaSeq) return;
    runInAction(() => {
      this.sqlSchema = schema;
    });
  }

  /**
   * The joins to suggest at `cursor` in the SQL panel's text. None when the
   * server can't say (no connection, or a pine-lang without the endpoint).
   */
  public async sqlJoinHints(query: string, cursor: number): Promise<SqlJoinHint[]> {
    try {
      return await client.sqlJoinHints(query, cursor, this.connectionId);
    } catch {
      return [];
    }
  }

  public setInputMode(mode: InputMode) {
    this.inputMode = mode;
    this.querySelection = '';
  }

  public setMessage(message: string, autoClearMs: number = 3000) {
    this.message = message;

    if (autoClearMs > 0) {
      setTimeout(() => {
        runInAction(() => {
          // Only clear if the message hasn't been changed by something else
          if (this.message === message) {
            this.message = '';
          }
        });
      }, autoClearMs);
    }
  }

  shownBuiltQuery(showHidden: boolean): string {
    return showHidden ? this.builtQuery : this.builtQueryWithoutHidden;
  }

  /**
   * Clipboard text for SQL: each line of pine as a -- line comment (if non-empty), then the query.
   */
  getSqlClipboardText(): string {
    const sql = this.query;
    const pine = this.expression;
    if (!pine.trim()) {
      return sql;
    }
    const commentedPine = pine
      .split(/\r?\n/)
      .map(line => (line ? `-- ${line}` : '--'))
      .join('\n');
    return `${commentedPine}\n\n${sql}`;
  }

  /**
   * Clipboard text for the current result grid, as CSV (header row + one row per result row).
   * Mirrors Result.tsx's exportToCSV so the toolbar button and the copy-result command agree.
   */
  getResultClipboardText(): string {
    // Not the hidden columns pine-lang adds for editing (each table's key,
    // each JSON value's type): they aren't part of the result anyone sees.
    const visibleColumns = this.columns.filter(
      col => col.field !== '_id' && this.columnVisibilityModel[col.field] !== false,
    );
    const headers = visibleColumns.map(col => col.headerName || col.field);

    const csvRows = [
      headers.join(','),
      ...this.rows.map(row =>
        visibleColumns
          .map(col => csvCell(row[col.field]))
          .join(','),
      ),
    ];

    return csvRows.join('\n');
  }

  async updateConnectionLogs() {
    const stats = await client.getConnectionStats();
    if (!stats) return;

    const newLog = {
      time: stats.time.toTimeString().split(' ')[0],
      count: stats.connectionCount,
    };

    // Update logs array
    runInAction(() => {
      if (this.connectionCountLogs.length >= TOTAL_BARS) {
        this.connectionCountLogs = [...this.connectionCountLogs.slice(1), newLog];
      } else {
        this.connectionCountLogs = [...this.connectionCountLogs, newLog];
      }
    });
  }
}

const getMessageFromHints = (operation: Operation, hints: Hints): string | undefined => {
  switch (operation.type) {
    case 'table':
      const tableExpressions = hints.table.map(h => h.pine);
      return tableExpressions ? tableExpressions.join(', ') : '';
    case 'select-partial':
      const columns = hints.select?.map(h => h.column);
      return columns ? columns.join(', ') : '';
    case 'where-partial':
      const whereColumns = hints.where?.map(h => h.column);
      return whereColumns ? whereColumns.join(', ') : '';
  }
};

const handleOperation = (response: Response): Operation => {
  if (!response.ast?.operation) {
    return { type: 'table' };
  }
  return response.ast.operation;
};

/**
 * Whether a session's expression came from an AI agent, so it must never
 * change data: the dedicated MCP tab. Exported for tests.
 */
export const agentSessionNeverWrites = (session: { isMcpSession: boolean }): boolean => session.isMcpSession;

const handleError = (response: Response): { error: string; errorType: string } => {
  return {
    error: response.error || '',
    errorType: response['error-type'] || '',
  };
};
