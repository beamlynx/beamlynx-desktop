import { GridColDef } from '@mui/x-data-grid';
import { makeAutoObservable, reaction, runInAction } from 'mobx';
import { format } from 'sql-formatter';
import { TOTAL_BARS } from '../constants';
import { DefaultPlugin } from '../plugin/default.plugin';
import { RecursiveDeletePlugin } from '../plugin/recursive-delete.plugin';
import { CanvasStore } from './canvas/canvas.store';
import { Ast, Hints, HttpClient, Operation, Response } from './client';
import { generateGraph, getCandidateIndex, Graph } from './graph.util';
import { getUserPreference, setUserPreference, STORAGE_KEYS } from './preferences';
import { debounce } from './util';

type ExpressionBlock = { text: string; startLine: number };

function splitExpressions(text: string): ExpressionBlock[] {
  const lines = text.split('\n');
  const blocks: ExpressionBlock[] = [];
  let current: string[] = [];
  let currentStart = 0;

  for (let i = 0; i <= lines.length; i++) {
    const line = lines[i];
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

// Canvas is not a distinct mode here - it's a global preference
// (global.canvasModeEnabled) that decides what the 'graph' mode renders,
// same session-mode value either way. See components/Session.tsx's MainView.
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
 * Depending on the operation type, we are using the appropriate plugin i.e.
 * default vs recursive delete.
 *
 * I would like to merge the logic for all invocations the the backend i.e.
 * build the expression, get the results, or evaluate in the recursive delete
 * mode.
 *
 * Right now, I need to keep the evaluation of recursive delete separate as it
 * lets me update parts of the session and not everything e.g. only update the
 * graph while keeping the pine expressions and the sql query the same. If I add
 * functionality for tabs within sessions, then each tab could hold a separate
 * pine expression and the related query for each data set that needs to be
 * deleted - but that requires more work to copy all the delete queries (and not
 * go throw each tab in the session and manually copy the queries).
 *
 * For now I'll keep it like this and let it percolate until I am convinced of a
 * way to refactor is in a better way.
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
  /** Vim mode */
  vimMode: boolean = false;

  /** Pine expression to be evaluated */
  expression: string = ''; // observable

  /** Input mode - pine or sql */
  inputMode: InputMode = 'pine';

  /** Per-session database connection id (pine's own id, e.g. `host:port` in desktop mode) */
  connectionId: string = '';

  /**
   * Desktop-only: which saved profile `connectionId` came from. Needed
   * because pine's own id is derived only from host:port -- coarser than a
   * saved profile's host+port+db+user, so two profiles can share one
   * connectionId. Blank in browser mode, where there's no separate profile
   * concept.
   */
  profileId: string = '';

  /** True while lazily (re)connecting this tab's assigned connection in the background. */
  connecting: boolean = false;

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

  /** Whether Canvas mode is the active graph editor right now (New Layout,
   * or Legacy Layout with its canvas/legacy graph switcher on) - see
   * GlobalStore.canvasActive. */
  get canvasActive(): boolean {
    return this.globalStore?.canvasActive ?? false;
  }

  /** Evaluation plugins */
  plugins: { delete: RecursiveDeletePlugin; default: DefaultPlugin };

  /**
   * Lazily-created, cached CanvasStore for this session - see
   * getCanvasStore(). Not initialized eagerly (unlike `plugins`) since most
   * sessions never open Canvas mode.
   */
  private canvasStore: CanvasStore | null = null;

  /** Debounced trigger for auto-run - see notifyCanvasCommit(). */
  private autoRunTrigger: () => void;

  /** Global store reference for accessing theme */
  private globalStore: any = null;

  constructor(id: string, globalStore?: any) {
    this.id = `session-${id}`;
    this.vimMode = getUserPreference(STORAGE_KEYS.VIM_MODE, false);
    this.globalStore = globalStore;

    makeAutoObservable(this);

    /** Evaluation plugins */
    this.plugins = {
      delete: new RecursiveDeletePlugin(this),
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
      // Canvas can keep committing (via its own independent probeBuild)
      // while the input is in SQL mode - but evaluate() would then run the
      // stale session.query left over from before the switch, ignoring the
      // gesture that just happened. Only auto-run while Pine is live.
      if (this.inputMode !== 'pine') return;
      if (this.loading) {
        // An eval from the previous gesture is still in flight - re-arm
        // rather than drop, so this gesture still gets its own run once
        // the current one resolves.
        this.autoRunTrigger();
        return;
      }
      void this.evaluate();
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
        // Skip building if in SQL mode - UNLESS canvas mode is active. This
        // guard predates canvas mode entirely (see git blame): it was
        // written when SQL mode meant "the user opted out of Pine for this
        // whole session," so there was never anything useful a build could
        // produce - no Pine editor to autocomplete, no graph to refresh.
        // Canvas mode breaks that assumption: it keeps rendering a graph and
        // needs a fresh `ast` regardless of which text panel (if any) is
        // open next to it (New Layout's Pine/SQL panel is a hand-editing
        // convenience, not a replacement for the canvas). Skipping this
        // build while canvas is active left `session.ast` stuck on
        // whatever it was when SQL mode was entered - canvas gestures kept
        // writing `session.expression`, but nothing ever re-derived the
        // graph from it (confirmed live: a join clicked while the SQL panel
        // was open never appeared, and the SQL panel's own text went stale
        // instead of reflecting it), and a session restored with `inputMode`
        // already 'sql' from a previous visit got stuck on the
        // "Connecting…" banner forever (also confirmed live, via reload).
        if (this.inputMode === 'sql' && !this.globalStore?.canvasActive) {
          runInAction(() => {
            this.hintsLoading = false;
          });
          return;
        }

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
          const activeIdx = cursor !== undefined
            ? findActiveBlock(blocks, cursor.line)
            : blocks.length - 1;
          const activeExpressions = blocks.slice(0, activeIdx + 1).map(b => b.text);
          const adjustedCursor = cursor && blocks[activeIdx]
            ? { line: cursor.line - blocks[activeIdx].startLine, character: cursor.character }
            : cursor;
          const response = await client.build(activeExpressions, adjustedCursor, this.connectionId);
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

          // query
          this.query = formatQuery(response.query);

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

  public toggleVimMode() {
    this.vimMode = !this.vimMode;
    setUserPreference(STORAGE_KEYS.VIM_MODE, this.vimMode);
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

  public async prettifyExpression(expression: string, appendPipe: boolean = false): Promise<string> {
    const blocks = splitExpressions(expression);
    if (blocks.length <= 1) {
      const prettified = await client.prettify(expression, this.connectionId);
      return appendPipe ? prettified + '\n | ' : prettified;
    }
    const cursor = this.cursorPosition;
    const activeIdx = cursor !== undefined
      ? findActiveBlock(blocks, cursor.line)
      : blocks.length - 1;
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

  public async evaluate() {
    const { type } = this.operation;
    switch (type) {
      case 'delete':
        return await this.plugins.delete.evaluate();
      case 'table':
      // intentional fall through
      default:
        return await this.plugins.default.evaluate();
    }
  }

  /**
   * Explicitly build an expression and return the AST.
   * This bypasses the reactive flow and is useful for imperative operations
   * like fetching hints for command palette options.
   *
   * Similar to evaluate() but only builds without executing.
   */
  public async build(expression: string): Promise<Ast> {
    const response = await client.build([expression], this.cursorPosition, this.connectionId);
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

const formatQuery = (query: string): string => {
  if (!query) return '';
  try {
    return format(query, {
      language: 'postgresql',
      indentStyle: 'tabularRight',
      denseOperators: false,
    });
  } catch (e) {}
  return '';
};
