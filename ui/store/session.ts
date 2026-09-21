import { GridColDef } from '@mui/x-data-grid';
import { makeAutoObservable, reaction, runInAction } from 'mobx';
import { TOTAL_BARS } from '../constants';
import { DefaultPlugin } from '../plugin/default.plugin';
import { EvaluateOptions } from '../plugin/plugin.interface';
import { formatSql } from '../utils/formatSql';
import { CanvasStore } from './canvas/canvas.store';
import {
  buildDeleteScript,
  DeleteOutcome,
  runDeleteScript,
  runTraversal,
  tablesInExpression,
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
} from './client';
import { generateGraph, getCandidateIndex, Graph } from './graph.util';
import { getUserPreference, setUserPreference, STORAGE_KEYS } from './preferences';
import { debounce } from './util';

type ExpressionBlock = { text: string; startLine: number };

/**
 * Whether `line` leaves a block comment open behind it, given it
 * started `open`. Naive: it doesn't know about `/*` inside a string literal.
 * That costs nothing here - the worst case is a blank line not ending a
 * block, and the block boundary a user actually meant is the next one.
 */
function blockCommentOpenAfter(line: string, open: boolean): boolean {
  let i = 0;
  while (i < line.length) {
    if (open) {
      const close = line.indexOf('*/', i);
      if (close === -1) return true;
      open = false;
      i = close + 2;
    } else {
      const start = line.indexOf('/*', i);
      if (start === -1) return false;
      open = true;
      i = start + 2;
    }
  }
  return open;
}

/**
 * Split the editor text into blank-line-separated expression blocks.
 *
 * A blank line inside an open block comment is not a boundary. A doc comment
 * at the top of a tab is exactly the place someone writes a paragraph break
 * (see pine-lang's docs/comments.md), and splitting there would hand the
 * server an unterminated comment as block 0 and the comment's own tail as
 * block 1 - a parse error out of text that is perfectly valid Pine.
 *
 * Exported only so __tests__/expression-blocks.test.js can cover that rule
 * directly; nothing outside this module uses it.
 */
export function splitExpressions(text: string): ExpressionBlock[] {
  const lines = text.split('\n');
  const blocks: ExpressionBlock[] = [];
  let current: string[] = [];
  let currentStart = 0;
  let inBlockComment = false;

  for (let i = 0; i <= lines.length; i++) {
    const line = lines[i];
    if (i < lines.length) {
      const wasOpen = inBlockComment;
      inBlockComment = blockCommentOpenAfter(line, inBlockComment);
      if (wasOpen && line.trim() === '') {
        if (current.length === 0) currentStart = i;
        current.push(line);
        continue;
      }
    }
    if (i === lines.length || line.trim() === '') {
      const joined = current.join('\n').trim();
      if (joined) blocks.push({ text: joined, startLine: currentStart });
      current = [];
      currentStart = i + 1;
    } else {
      if (current.length === 0) currentStart = i;
      current.push(line);
    }
  }
  return blocks;
}

function findActiveBlock(blocks: ExpressionBlock[], cursorLine: number): number {
  for (let i = blocks.length - 1; i >= 0; i--) {
    if (blocks[i].startLine <= cursorLine) return i;
  }
  return blocks.length - 1;
}

// Canvas is not a distinct mode here - it's the only renderer 'graph' has
// (the classic node-graph widget, GraphBox, was removed). See
// components/Session.tsx's MainView.
export type Mode = 'documentation' | 'graph' | 'result' | 'monitor';

export type Theme = 'light' | 'dark';

export type InputMode = 'pine' | 'sql';

export type Row = { [key: string]: any };

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

  /** Database connection monitoring */
  monitor: boolean = false;
  connectionCountLogs: { time: string; count: number }[] = [];

  /** Expression/query that was last successfully evaluated (for coloring only after eval) */
  expressionAtLastEval: string = '';

  /** Result */
  loading: boolean = false; // observable
  columns: GridColDef[] = [];
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
    makeAutoObservable<Session, 'traversalSignal'>(this, { traversalSignal: false });

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
          const activeIdx =
            cursor !== undefined ? findActiveBlock(blocks, cursor.line) : blocks.length - 1;
          const activeExpressions = blocks.slice(0, activeIdx + 1).map(b => b.text);
          const adjustedCursor =
            cursor && blocks[activeIdx]
              ? { line: cursor.line - blocks[activeIdx].startLine, character: cursor.character }
              : cursor;
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
    const activeIdx =
      cursor !== undefined ? findActiveBlock(blocks, cursor.line) : blocks.length - 1;
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
        error: null,
        run: 'idle',
        outcomes: [],
      };
    });

    try {
      // The delete verb gets the run-time backstop. The two conditions
      // canDeleteTraverse checks are an argument about the foreign-key graph,
      // and the cost of that argument being wrong is a delete that silently
      // removes nothing. Counting needs no such guard - it only reads.
      const forbidden =
        verb === 'delete'
          ? tablesInExpression(this.ast, this.ast?.current ?? '')
          : undefined;
      const result = await runTraversal(traversalClient, rootExpression, {
        connectionId: this.connectionId,
        signal,
        forbidden,
        forDelete: verb === 'delete',
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
      const script =
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
        this.traversal.script = script;
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
   * Whether this tab's connection has been opted in to destructive actions.
   * False for an unsaved connection, and false on web, where there is no
   * credential store to hold the decision - see
   * SavedConnectionMeta.allowDestructive.
   */
  get canRunDelete(): boolean {
    return this.globalStore?.allowsDestructiveActions?.(this.profileId) === true;
  }

  /**
   * How the connection is named in the confirmation. Its label AND its host,
   * because a label alone is exactly the thing someone misreads when two
   * connections are called something similar - and "which database" is the
   * mistake the confirmation exists to catch.
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
    if (!this.canRunDelete) return;
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
   * Runs the planned deletes. Gated twice on purpose, for two different
   * mistakes: `canRunDelete` catches the wrong *database*, decided once per
   * connection; the confirmation catches the wrong *query*, which you only
   * notice with the numbers in front of you.
   */
  async confirmTraversalRun() {
    const traversal = this.traversal;
    if (!traversal || traversal.run !== 'confirming' || !this.canRunDelete) return;
    runInAction(() => {
      traversal.run = 'running';
      traversal.outcomes = [];
    });
    await runDeleteScript(
      traversalClient,
      traversal.nodes,
      this.connectionId,
      outcome =>
        runInAction(() => {
          if (this.traversal === traversal) traversal.outcomes = [...traversal.outcomes, outcome];
        }),
    );
    runInAction(() => {
      if (this.traversal === traversal) traversal.run = 'finished';
    });
  }

  cancelTraversal() {
    if (this.traversalSignal) this.traversalSignal.cancelled = true;
  }

  closeTraversal() {
    this.cancelTraversal();
    runInAction(() => {
      this.traversal = null;
    });
  }

  public async evaluate(opts?: EvaluateOptions) {
    // The agent's session never writes, whoever asked it to. runMcpQuery
    // already passes allowWrites: false, so this is not what stops an agent
    // today -- it is what stops the next caller. Binding it to the session
    // means a future path into this tab that forgets the option inherits the
    // safe answer instead of silently inheriting writes (allow-writes
    // defaults to allowed server-side, for the person's own editor). It also
    // covers the person pressing Run on the agent's own tab, where the
    // expression on screen is the agent's, not theirs.
    const effectiveOpts: EvaluateOptions | undefined = this.isMcpSession
      ? { ...opts, allowWrites: false }
      : opts;
    return await this.plugins.default.evaluate(effectiveOpts);
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
          .map(col => {
            const value = row[col.field];
            if (value === null || value === undefined) {
              return '';
            }
            const stringValue = String(value);
            if (
              stringValue.includes(',') ||
              stringValue.includes('"') ||
              stringValue.includes('\n')
            ) {
              return `"${stringValue.replace(/"/g, '""')}"`;
            }
            return stringValue;
          })
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

const handleError = (response: Response): { error: string; errorType: string } => {
  return {
    error: response.error || '',
    errorType: response['error-type'] || '',
  };
};
