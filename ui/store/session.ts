import { makeAutoObservable, observable, reaction, runInAction } from 'mobx';
import { TOTAL_BARS } from '../constants';
import { DefaultPlugin } from '../plugin/default.plugin';
import { EvaluateOptions } from '../plugin/plugin.interface';
import { csvCell } from '../utils/csv';
import { mayChangeData } from './canvas/pine-text';
import { formatSql } from '../utils/formatSql';
import { CanvasStore } from './canvas/canvas.store';
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
  Ast,
  ConnectionInfo,
  effectiveAccessPolicyRules,
  Hints,
  HttpClient,
  Operation,
  Response,
  VariablesReport,
} from './client';
import { generateGraph, getCandidateIndex, Graph } from './graph.util';
import { getUserPreference, setUserPreference, STORAGE_KEYS } from './preferences';
import { debounce } from './util';

// The editor text split into blocks, and which block is the query a build
// works on: in store/blocks.ts, a module with no imports, so the canvas and
// values-block helpers can use them without importing this store.
import {
  blocksForBuild,
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

export type Row = { [key: string]: any };

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

export type ColumnMetadata = {
  colIndexToAliasLookup: Record<string, string>; // i.e. which table does the column belong to
  aliasToIdLookup: Record<string, string>; // i.e. what is the id column index for the table
  colIndexToColumnLookup: Record<string, string>; // i.e. what is the column name for the column index
};

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

  /** Per-session database connection id (pine's own id, e.g. `host:port:dbname` in desktop mode) */
  connectionId: string = '';

  /**
   * Desktop-only: which saved profile `connectionId` came from. Needed
   * because pine's own id is derived from host+port+dbname only, one level
   * coarser than a saved profile's host+port+db+user -- two profiles that
   * target the same database as different users share one connectionId
   * (pine itself only lets one of them actually be connected at a time; see
   * pine.db.connections/add-connection-pool). Blank in browser mode, where
   * there's no separate profile concept.
   */
  profileId: string = '';

  /** True while lazily (re)connecting this tab's assigned connection in the background. */
  connecting: boolean = false;

  /**
   * Desktop-only: set when this tab was opened to review an MCP agent's
   * request_reveal call (see RevealRequestHandler.tsx) -- the id the agent's
   * matching check_reveal poll is waiting on. Cleared once the owner
   * reveals or declines (RevealRequestBanner.tsx), at which point this goes
   * back to being an ordinary tab. A normal tab opened any other way never
   * has this set.
   */
  pendingRevealRequestId?: string;

  /** The agent-supplied reason for the request_reveal call this tab is reviewing, if any. */
  revealReason?: string;

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
  columns: ResultColumn[] = [];
  // The field name - which is the index of the column (stringified) - and the
  // value is false The id fields are hidden by default but kept in the list of
  // columns so that finding the correct id of the row being updated is possible
  columnVisibilityModel: Record<string, boolean> = {};
  columnMetadata: ColumnMetadata = {
    colIndexToAliasLookup: {},
    aliasToIdLookup: {},
    colIndexToColumnLookup: {},
  };
  rows: Row[] = [];

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
  query: string = '';
  /** Currently selected text in the SQL editor, if any. Running a query while text is
   * selected runs only the selection instead of the full query. */
  querySelection: string = '';
  hints: Hints | null = null; // observable

  /** Graph */
  candidateIndex: number | undefined = undefined; // observable

  graph: Graph = {
    candidate: null,
    selectedNodes: [],
    suggestedNodes: [],
    edges: [],
  };

  /** Cursor position */
  cursorPosition?: { line: number; character: number };

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
      this.isMcpSession,
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
    return !!this.globalStore?.mcpSessionId && this.id === this.globalStore.mcpSessionId;
  }

  /**
   * True for a tab whose expression came from an AI agent: the MCP tab, or a
   * tab opened to review a request_reveal call. evaluate() never lets such a
   * tab change data, whoever presses Run.
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
    makeAutoObservable<Session, 'traversalSignal' | 'runSignal'>(this, {
      traversalSignal: false,
      runSignal: false,
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
          // reset the candidate
          this.candidateIndex = undefined;

          if (expression.trim() === '' && this.mode === 'graph') {
            this.mode = 'documentation';
          } else if (expression.trim() !== '' && this.mode === 'documentation') {
            this.mode = 'graph';
          }
        });

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
            this.accessPolicyRules,
          );
          runInAction(() => {
            this.response = response;
            this.lastHintsCursorPosition = cursor;
          });
        } catch (e) {
          runInAction(() => {
            this.error = (e as any).message || 'Failed to build';
          });
        } finally {
          runInAction(() => {
            this.hintsLoading = false;
          });
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

          // query
          this.query = formatSql(response.query);

          // operation
          this.operation = handleOperation(response);

          // error
          const { error, errorType } = handleError(response);
          this.error = error;
          this.errorType = errorType;
        });
      },
    );

    /**
     * Handle the ast
     * - Graph
     */
    reaction(
      () => this.ast,
      ast => {
        if (!ast) return;

        const isDark = this.globalStore?.theme === 'dark';
        const graph = generateGraph(ast, this.id, isDark);
        runInAction(() => {
          this.graph = graph;
        });
      },
    );

    /**
     * Handle the candidate index
     * - Candidate
     */
    reaction(
      () => this.candidateIndex,
      ci => {
        if (ci === undefined) return;
        const ast = this.ast;
        if (!ast?.hints) return;

        const {
          hints: { table: suggestedTables },
        } = ast;

        const sanitizedCandidateIndex = getCandidateIndex(suggestedTables, ci);
        for (const { h, i } of suggestedTables.map((h, i) => ({ h, i }))) {
          if (i === sanitizedCandidateIndex) {
            runInAction(() => {
              this.graph.candidate = h;
            });
            break;
          }
        }
      },
    );

    /**
     * Handle the candidate
     * - Suggested Pine Expression
     */
    reaction(
      () => this.graph.candidate,
      candidate => {
        if (!candidate) return;
        const { pine } = candidate;
        runInAction(() => {
          this.message = pine;
        });
      },
    );
  }

  public selectNextCandidate(offset: number) {
    this.candidateIndex = this.candidateIndex === undefined ? 0 : this.candidateIndex + offset;
  }

  private async getExpressionUsingCandidate() {
    if (!this.graph.candidate) {
      throw new Error('Unable to update the expression as no candidate is selected.');
    }
    const { pine } = this.graph.candidate;
    return await this.pipeExpression(pine, true);
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

  public async updateExpressionUsingCandidate() {
    const expression = await this.getExpressionUsingCandidate();
    runInAction(() => {
      this.expression = expression;
    });
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
    const response = await client.eval(
      [...blocks.slice(0, last), `${blocks[last]} | count:`],
      this.connectionId,
      this.accessPolicyRules,
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
    const rootExpression = this.expression.trim();
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

  public async evaluate(opts?: EvaluateOptions) {
    // An agent's tab never writes, whoever asked it to. runMcpQuery already
    // passes allowWrites: false, so for the MCP tab this is not what stops an
    // agent today -- it is what stops the next caller. Binding it to the
    // session means a future path into this tab that forgets the option
    // inherits the safe answer instead of silently inheriting writes
    // (allow-writes defaults to allowed server-side, for the person's own
    // editor). It also covers the person pressing Run on an agent's tab,
    // where the expression on screen is the agent's, not theirs.
    //
    // A reveal-review tab is an agent's tab too: RevealRequestHandler runs
    // the agent's expression the moment the request arrives, so the owner
    // can see the data before deciding. Without this, `user | delete!` sent
    // as a reveal request deleted rows before anyone was asked.
    const effectiveOpts: EvaluateOptions | undefined = this.isAgentSession
      ? { ...opts, allowWrites: false }
      : opts;
    const result = await this.plugins.default.evaluate(effectiveOpts);
    if (this.openedFromLink && !this.error) {
      runInAction(() => {
        this.openedFromLink = false;
      });
    }
    return result;
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
      this.accessPolicyRules,
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
  pendingSelection: { anchor: number; head: number } | null = null;

  public setExpressionWithSelection(expression: string, selection: { anchor: number; head: number } | null) {
    this.pendingSelection = selection;
    this.expression = expression;
    this.textInputFocused = true;
  }

  public updateCursorPosition(line: number, character: number) {
    this.cursorPosition = { line, character };
  }

  public requestHints() {
    // Only needed when the cursor moved without a text change — e.g. clicking
    // or arrow-keying into an earlier segment, then pressing Tab — since the
    // build reaction above is keyed on `expression`, not cursor position, and
    // won't refire on its own. If the cursor hasn't moved since the last
    // build, hints are already fresh for it: skip the rebuild. Firing it
    // anyway would still resolve to the same hints, but the new (structurally
    // identical) response replaces `ast`, which recreates the CodeMirror
    // autocompletion extension mid-open and flickers the just-highlighted
    // candidate.
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
    const visibleColumns = this.columns.filter(col => col.field !== '_id');
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
 * change data: the dedicated MCP tab, or a tab reviewing a request_reveal
 * call. Exported for tests.
 */
export const agentSessionNeverWrites = (session: {
  isMcpSession: boolean;
  pendingRevealRequestId?: string;
}): boolean => session.isMcpSession || !!session.pendingRevealRequestId;

const handleError = (response: Response): { error: string; errorType: string } => {
  return {
    error: response.error || '',
    errorType: response['error-type'] || '',
  };
};
