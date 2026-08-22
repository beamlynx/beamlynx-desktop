import React, { useEffect, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { Handle, NodeProps, Position, useUpdateNodeInternals } from 'reactflow';
import { CanvasHandle, CanvasTableNodeData, PickerState } from '../../../store/canvas/canvas.model';
import { getNodeHeight, nodeWidth } from '../../../store/canvas/layout';
import { useCanvasStore } from '../canvas-context';

/**
 * The alias a currently-open picker is targeting, regardless of its mode -
 * null if closed or table-picker. Exported for FrameNode.tsx's own
 * `engaged` check - a checkpoint's picker (opened via openCheckpointPicker)
 * still ends up as a normal `PickerState` keyed by the checkpoint's pinned
 * name, exactly like any table's.
 */
export const pickerAliasFor = (picker: PickerState): string | null => {
  if (!picker.open) return null;
  if (picker.mode === 'where-value') return picker.alias;
  return 'alias' in picker.request ? picker.request.alias : null;
};

export type OperationKind = 'select' | 'join' | 'where' | 'order' | 'group';

/**
 * Which single operation this node's own action bar is mid-flight on, if
 * any - null whenever nothing is open for this alias, or the open picker is
 * the table picker (StartNode's, which never targets a real alias). While
 * this is non-null, the action bar shows only that one operation instead of
 * all five: once you're inside e.g. "select", seeing "join"/"where"/"order"/
 * "group" alongside it is just noise you can't act on right now (a picker
 * being open already means we're in insert mode - see CanvasStore.mode -
 * where none of those other letters do anything). Exported for FrameNode.tsx
 * to apply the same decluttering to a checkpoint's own action bar -
 * `openCheckpointPicker` (canvas.store.ts) ultimately calls
 * `openColumnPicker`/`openJoinPicker` with the checkpoint's pinned name,
 * which is exactly the FrameNode's own `id` (see that file's own doc
 * comment), so this same alias-keyed check works unchanged for it.
 */
export const activeOperationFor = (picker: PickerState, alias: string): OperationKind | null => {
  if (!picker.open) return null;
  if (picker.mode === 'where-value') return picker.alias === alias ? 'where' : null;
  // Every `PickerRequest` variant except `{ kind: 'table' }` carries `alias`
  // (see canvas.model.ts) - the `'alias' in` check below already narrows
  // `picker.request.kind` to exclude `'table'`, so no separate check for it
  // is needed (TS itself flags one as unreachable).
  if (!('alias' in picker.request) || picker.request.alias !== alias) return null;
  return picker.request.kind;
};

// A small, self-contained equivalent of RelationHandles.tsx - not imported
// from there because that component's props are typed against model.d.ts's
// NodeHandle, and canvas mode deliberately doesn't depend on model.d.ts (see
// the plan doc's "explicitly untouched" file list).
const handleRowHeight = 14;
const headerHeight = 48;

// Square, not round - a join column is a "pin" on the component package, and
// pins are square in this system (see the notch/badge below); a round dot
// here would read as a different kind of thing from everything else.
// Exported so FrameNode.tsx can render join handles for a checkpoint the
// same way - the checkpoint's own name is a real alias joins address it by
// (see layout.ts's deriveGraph/makeFrameNode), so its handles should look
// identical to any table's.
export const RelationDots = ({
  handles,
  type,
  position,
}: {
  handles: CanvasHandle[];
  type: 'target' | 'source';
  position: Position;
}) => {
  if (handles.length === 0) return null;
  const labelSide: React.CSSProperties = position === Position.Left ? { left: 8 } : { right: 8 };
  return (
    <>
      {handles.map((h, i) => {
        const top = headerHeight + (i + 0.5) * handleRowHeight;
        return (
          <React.Fragment key={h.id}>
            <Handle
              type={type}
              position={position}
              id={h.id}
              style={{ width: 6, height: 6, borderRadius: 1, background: 'var(--canvas-pin)', top }}
            />
            {h.column && (
              <div
                title={h.column}
                style={{
                  position: 'absolute',
                  top,
                  transform: 'translateY(-50%)',
                  maxWidth: nodeWidth - 24,
                  fontSize: '7px',
                  fontFamily: 'var(--canvas-font)',
                  color: 'var(--canvas-text-dim)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  pointerEvents: 'none',
                  ...labelSide,
                }}
              >
                {h.column}
              </div>
            )}
          </React.Fragment>
        );
      })}
    </>
  );
};

// Actions (join/select/where/order) get the accent (trace) color, text only -
// no border or fill - so they read as a toolbar over the node rather than a
// row of bordered boxes in the node's own background color, which in dark
// mode looked like a stack of tiny nodes sitting on top of the real one.
// Uppercase + letter-spacing gives them the small printed-label feel of a
// schematic's own annotations, rather than looking like body text.
// `picker-trigger` marks every element that opens or manages a picker
// itself - Picker.tsx's click-outside-to-close listener skips these so a
// click that's actually "open this node's own picker" (or "switch to a
// different node's picker") isn't preempted by the outside-click handler
// closing things first. Defined on the component so every call site gets
// it - a per-call-site className is one more place to forget it.
// Exported so FrameNode.tsx can render the same action bar look for a
// checkpoint's own select/where/order actions - both are ultimately "a set
// of actions attached to something occupying a pipeline slot" (a table or a
// sealed checkpoint), so they should look identical, not like two different
// button systems.
export const ActionButton = ({
  label,
  onClick,
  testId,
  emphasizeKey,
  emphasizeIndex = 0,
  suppressed,
}: {
  label: string;
  onClick: (anchor: { x: number; y: number }) => void;
  testId?: string;
  /**
   * True only while this node is the keyboard-focus cursor AND normal mode
   * is active - i.e. this exact letter is armed right now. Renders the
   * letter at `emphasizeIndex` (its keyboard shortcut - see
   * useCanvasKeybindings.ts) bold and full-size, the rest dimmed and
   * smaller - weight/size carries the emphasis, not a new color, so this
   * stays in the same blue trace/current family the rest of the focus
   * treatment uses rather than introducing a second accent hue. The
   * schematic's own printed-annotation style, extended to double as a live
   * "these keys are armed" indicator, rather than a separate keycap chip
   * that would visually collide with the pin glyphs below. Omitted/false
   * renders exactly as before - no letter split, no visual change.
   */
  emphasizeKey?: boolean;
  /**
   * Which character of `label` is the actual shortcut key - defaults to 0
   * (the leading letter), true for select/where/order/group. `join`'s
   * shortcut is `i` (see useCanvasKeybindings.ts - it opens the same picker
   * as a table's first-insert), which isn't join's first letter but is its
   * third ("j-o-I-n"), so that operation passes `emphasizeIndex={2}` instead
   * of relying on this default.
   */
  emphasizeIndex?: number;
  /**
   * True for every operation except the one whose picker is currently open
   * (see TableNode's `activeOperation`/`operations` and FrameNode's mirror
   * of the same). Dims via opacity only - the button stays in the DOM at
   * its normal place in the row rather than being removed, which is the
   * whole point: removing the other four and letting the row re-center
   * around the one survivor was the first version of this, and it moved
   * that label to a different on-screen position the instant a picker
   * opened (confirmed live, reported as "why does the position change").
   * Opacity-only keeps every button's position fixed regardless of which
   * one (if any) is active, matching this file's existing opacity-only
   * convention for the whole action bar (see the comment on `engaged`).
   */
  suppressed?: boolean;
}) => (
  <div
    data-testid={testId}
    className="picker-trigger"
    onClick={e => {
      e.stopPropagation();
      onClick({ x: e.clientX, y: e.clientY });
    }}
    style={{
      fontSize: '8px',
      // Fixed regardless of emphasizeKey - the emphasized letter below only
      // ever changes weight/color, never size, specifically so this row's
      // rendered height can't change when a node gains/loses keyboard focus.
      // A size bump here once did exactly that (a taller glyph stretched the
      // whole flex row a couple px taller, shifting the card frame beneath
      // it down by the same amount) - confirmed live as the cause of "the
      // node moves when the focus border appears".
      lineHeight: '8px',
      fontFamily: 'var(--canvas-font)',
      fontWeight: 600,
      textTransform: 'uppercase',
      letterSpacing: '0.4px',
      padding: '2px 4px',
      cursor: 'pointer',
      color: 'var(--canvas-trace)',
      whiteSpace: 'nowrap',
      opacity: suppressed ? 0.25 : 1,
      transition: 'opacity 0.1s ease-in-out',
    }}
  >
    {emphasizeKey ? (
      <>
        <span style={{ color: 'var(--canvas-text-dim)' }}>{label.slice(0, emphasizeIndex)}</span>
        <span style={{ fontWeight: 800 }}>{label[emphasizeIndex]}</span>
        <span style={{ color: 'var(--canvas-text-dim)' }}>{label.slice(emphasizeIndex + 1)}</span>
      </>
    ) : (
      label
    )}
  </div>
);

// A visible separator between actions - color alone (no border/background)
// read as one continuous run of words ("join select where order"), not as
// four separate controls.
export const ActionDivider = () => (
  <span aria-hidden style={{ color: 'var(--canvas-node-border)', fontSize: '9px' }}>
    |
  </span>
);

// Node removal reads as a destructive, one-off action rather than another
// "add a clause" action (and "delete" is easy to mistake for Pine/SQL
// DELETE) - a small × close button, off to the side, keeps it visually
// distinct from the join/select/where/order row instead of sitting in line
// with them as just another button. Plain glyph, no fill/circle/warning
// color: this only ever appears already gated behind `engaged` (hover or
// focus), so it doesn't need its own attention-grabbing treatment on top of
// that - a quiet × reads as "close", not an alarm. Sits inside the card's
// own top-right corner (not straddling the border) so it doesn't compete
// with the notch/pin system that lives right at the edges. Exported so
// FrameNode.tsx can offer the same "cancel this" affordance for a
// checkpoint - removing a container is the same kind of one-off destructive
// action as removing a table, so it should look identical, not like a
// second delete-button system.
export const DeleteButton = ({ onClick, testId }: { onClick: () => void; testId?: string }) => (
  <div
    data-testid={testId}
    onClick={e => {
      e.stopPropagation();
      onClick();
    }}
    title="Remove node"
    style={{
      position: 'absolute',
      top: 6,
      right: 6,
      width: '16px',
      height: '16px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      cursor: 'pointer',
      fontSize: '13px',
      lineHeight: 1,
      color: 'var(--canvas-text-dim)',
    }}
  >
    &times;
  </div>
);

// `label` names the row (select/where/order) - without it the three rows
// were just stacked text with no way to tell, at a glance, which kind of
// clause each chip belonged to. Each chip gets a small square "pin" mark
// before its text, tying a selected/filtered/ordered column back to the
// same pin visual as the join handles - it's the same kind of fact (a
// specific column this node cares about), just not one that connects to
// another node.
const ChipRow = ({
  label,
  chips,
  onRemove,
}: {
  label: string;
  chips: string[];
  onRemove?: (index: number) => void;
}) => {
  if (chips.length === 0) return null;
  return (
    <div
      className="nodrag"
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '4px',
        marginTop: '4px',
        alignItems: 'center',
      }}
    >
      <span
        style={{
          fontSize: '7px',
          fontFamily: 'var(--canvas-font)',
          textTransform: 'uppercase',
          fontWeight: 700,
          letterSpacing: '0.3px',
          color: 'var(--canvas-text-dim)',
        }}
      >
        {label}
      </span>
      {chips.map((chip, i) => (
        <div
          key={`${chip}-${i}`}
          style={{
            fontSize: '8px',
            fontFamily: 'var(--canvas-font)',
            background: 'var(--canvas-chip-bg)',
            padding: '2px 6px',
            borderRadius: '3px',
            border: '1px solid var(--canvas-chip-border)',
            color: 'var(--canvas-text)',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
          }}
        >
          <span style={{ width: 4, height: 4, flexShrink: 0, background: 'var(--canvas-pin)' }} />
          <span>{chip}</span>
          {onRemove && (
            <span
              onClick={e => {
                e.stopPropagation();
                onRemove(i);
              }}
              style={{ cursor: 'pointer', opacity: 0.6 }}
            >
              &times;
            </span>
          )}
        </div>
      ))}
    </div>
  );
};

// The identity box's one signature cut: a small diagonal notch on the
// bottom-left corner, like an IC package's pin-1 orientation mark - it's
// what turns a plain rounded rectangle into "a component", the same idea
// carried through by the square pins and badge. Bottom-left specifically
// because the top corners are already claimed (sequence badge top-left,
// delete × top-right) - cutting either of those would collide with a real
// control.
const notchSize = 10;
const cardClipPath = `polygon(0 0, 100% 0, 100% 100%, ${notchSize}px 100%, 0 calc(100% - ${notchSize}px))`;

const TableNode: React.FC<NodeProps<CanvasTableNodeData>> = observer(({ id, data }) => {
  const canvasStore = useCanvasStore();
  const updateNodeInternals = useUpdateNodeInternals();
  const handleKey = [...data.leftHandles, ...data.rightHandles].map(h => h.id).join(',');
  const [hovered, setHovered] = useState(false);

  useEffect(() => {
    updateNodeInternals(id);
  }, [id, handleKey, updateNodeInternals]);

  const height = getNodeHeight({ id, type: 'table-node', position: { x: 0, y: 0 }, data });

  // Keyboard focus (the modal keybinding layer's cursor, CanvasStore.
  // focusedAlias) IS shown as "current" - the same thick border/bg treatment
  // that used to be driven by `data.isCurrent` (the AST's own semantic
  // cursor: where an unprefixed gesture attaches). They're deliberately
  // rendered as one visual state, not two: navigating here is what makes an
  // eventual action here attach without needing an explicit `from:` prefix
  // (see CanvasStore.openColumnPicker's focusPrefix / commitJoin's
  // fromAlias, both already keyed off `alias !== ast.current`) - so from the
  // user's perspective, moving the cursor already IS moving "current". The
  // mechanism stays lazy for real, though: navigating never itself touches
  // `ast.current` or the network - only committing a real action while
  // focus differs from the true AST current emits the `from:` prefix that
  // makes it official. Doing that eagerly on every keypress would mean a
  // build round-trip and an undo-stack entry per navigation step (`u` would
  // undo your last look-around, not your last edit) - `data.isCurrent`
  // itself is no longer read anywhere in this file (or elsewhere - see the
  // canvas.model.ts comment on the field).
  const isFocusTarget = canvasStore.focusedAlias === data.alias;
  const showKeyHints = isFocusTarget && canvasStore.mode === 'normal';

  // Actions stay visible either on hover, on keyboard focus, OR while a
  // picker this node opened is still open - otherwise moving the mouse off
  // the node to click an item in the select/where/order dropdown (which
  // renders outside the node's own hover region) makes the action bar
  // vanish mid-interaction, which reads as "the actions are gone" even
  // though you're still using one of them.
  const engaged = hovered || isFocusTarget || pickerAliasFor(canvasStore.picker) === data.alias;

  // The five operations, in their fixed display order - a plain lookup
  // (not derived from anywhere else) so both render paths below (all five,
  // or just the one mid-flight) read off the same list instead of two
  // hand-duplicated JSX blocks drifting apart.
  const operations: {
    kind: OperationKind;
    label: string;
    onClick: (anchor: { x: number; y: number }) => void;
    emphasize?: boolean;
    emphasizeIndex?: number;
  }[] = [
    {
      kind: 'select',
      label: 'select',
      onClick: anchor => canvasStore.openColumnPicker('select', data.alias, anchor),
      emphasize: showKeyHints,
    },
    {
      kind: 'join',
      label: 'join',
      // `i` (insert) opens this same picker (see useCanvasKeybindings.ts)
      // since a join is "insert a new node from here", the same action as
      // inserting the very first table - but `i` isn't join's first letter,
      // it's its third ("j-o-I-n"), so this needs an explicit index rather
      // than ActionButton's default.
      onClick: anchor => canvasStore.openJoinPicker(data.alias, anchor),
      emphasize: showKeyHints,
      emphasizeIndex: 2,
    },
    {
      kind: 'where',
      label: 'where',
      onClick: anchor => canvasStore.openColumnPicker('where', data.alias, anchor),
      emphasize: showKeyHints,
    },
    {
      kind: 'order',
      label: 'order',
      onClick: anchor => canvasStore.openColumnPicker('order', data.alias, anchor),
      emphasize: showKeyHints,
    },
    {
      kind: 'group',
      label: 'group',
      onClick: anchor => canvasStore.openColumnPicker('group', data.alias, anchor),
      emphasize: showKeyHints,
    },
  ];
  // While this node's own picker is open (insert mode, on this alias), the
  // other four operations aren't doing anything right now - dim them rather
  // than removing them (see ActionButton's `suppressed` doc comment for why
  // removal was the first version of this and had to be reverted: with the
  // row's `justifyContent: center`, dropping four of five buttons re-centers
  // the row around the survivor, visibly moving its label).
  const activeOperation = activeOperationFor(canvasStore.picker, data.alias);

  return (
    <div
      style={{ width: nodeWidth }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Action bar - progressive disclosure: hidden until the node is
          hovered (or its own picker is open, see `engaged` above), so a
          graph with many nodes isn't wall-to-wall buttons. Opacity only
          (not pointer-events, not conditional rendering). Layout space
          stays reserved either way - dagre already budgets for it via
          actionBarHeight (layout.ts), and removing it from the DOM on
          hover would shift the box beneath it on every mouse-enter.
          Deliberately NOT `pointerEvents: engaged ? 'auto' : 'none'`: that
          gates on React state that only flips a tick after the mouseenter
          that triggered it, and a click arriving in that same tick (a fast
          real click, or - confirmed live - Playwright's `.click()`, which
          moves the mouse and clicks with no gap) lands while pointer-events
          is still 'none' and is silently swallowed. A real pointer can't
          click a spot it hasn't already hovered, so opacity alone already
          keeps the button invisible-until-hovered for a human; disabling
          pointer-events on top only adds a race, it doesn't add safety.
          `nodrag` (a ReactFlow convention) keeps a click here from also
          being read as a zero-movement node drag, which would otherwise
          call onNodeDragStop with the node's current (possibly still-
          default) internal position and permanently freeze it there -
          confirmed live: clicking "join" right after a node's first
          render pinned it at {x:0,y:0}, which then collided with the next
          node's fresh dagre layout instead of being re-laid-out.
          stopPropagation on the button's click handler alone doesn't
          prevent this - ReactFlow's drag listener triggers on pointerdown,
          beneath React's synthetic click bubbling. */}
      <div
        data-testid={`canvas-node-${data.alias}`}
        className="nodrag"
        style={{
          display: 'flex',
          justifyContent: 'center',
          gap: '3px',
          marginBottom: '4px',
          flexWrap: 'nowrap',
          opacity: engaged ? 1 : 0,
          transition: 'opacity 0.1s ease-in-out',
        }}
      >
        {operations.map((op, i) => (
          <React.Fragment key={op.kind}>
            {i > 0 && <ActionDivider />}
            <ActionButton
              label={op.label}
              testId={`action-${op.kind}-${data.alias}`}
              onClick={op.onClick}
              emphasizeKey={op.emphasize}
              emphasizeIndex={op.emphasizeIndex}
              suppressed={activeOperation !== null && op.kind !== activeOperation}
            />
          </React.Fragment>
        ))}
      </div>

      {/* Identity - the outer wrapper here is the positioning context for the
          badge/delete-x below; the notch is drawn via clip-path on the INNER
          card div only, never on this wrapper, because clip-path clips to
          its own element's border box - anything a child positions outside
          that box (the badge and delete-x both poke out past the corners on
          purpose, see below) would get silently clipped away too if it sat
          on the same element as the notch. Confirmed live: both were
          invisible until split out this way. */}
      <div style={{ position: 'relative' }}>
        <div
          style={{
            boxSizing: 'border-box',
            width: nodeWidth,
            minHeight: height,
            padding: '10px 10px 6px 10px',
            border: isFocusTarget
              ? '3px solid var(--canvas-node-border-current)'
              : '1.5px solid var(--canvas-node-border)',
            // A background swap (not just a border/glow, which turned out too
            // subtle to notice at a glance across a busy graph) for whichever
            // node has keyboard focus - see isFocusTarget above.
            background: isFocusTarget ? 'var(--canvas-node-bg-current)' : 'var(--canvas-node-bg)',
            borderRadius: '3px',
            clipPath: cardClipPath,
            color: 'var(--canvas-text)',
            fontFamily: 'var(--canvas-font)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
            <span
              title={data.table}
              style={{
                minWidth: 0,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {data.table}
            </span>
            <span
              style={{
                flexShrink: 0,
                fontSize: '9px',
                fontFamily: 'var(--canvas-font)',
                color: 'var(--canvas-text-dim)',
              }}
            >
              ({data.alias})
            </span>
          </div>

          <RelationDots handles={data.leftHandles} type="target" position={Position.Left} />
          <RelationDots handles={data.rightHandles} type="source" position={Position.Right} />
          {/* Default (unnamed) handles - every other handle on this node is
              named (`l:column`/`r:column`, from an actually-resolved join's
              columns). An edge with no column info to name a handle after -
              an unresolved join, relation === null, nothing to connect on -
              has nowhere to attach without these, and ReactFlow silently
              drops it rather than erroring (confirmed live: the "unresolved
              join" warning-colored line never appeared at all, only a
              console warning - "Couldn't create edge for source handle id:
              undefined"). Invisible and non-interactive; they're a fallback
              anchor point, not a connection handle for the user to see or use. */}
          <Handle
            type="target"
            position={Position.Left}
            style={{ opacity: 0, pointerEvents: 'none' }}
          />
          <Handle
            type="source"
            position={Position.Right}
            style={{ opacity: 0, pointerEvents: 'none' }}
          />
        </div>

        {data.removable && (
          <div
            className="nodrag"
            style={{ opacity: engaged ? 1 : 0, transition: 'opacity 0.1s ease-in-out' }}
          >
            <DeleteButton
              testId={`action-delete-${data.alias}`}
              onClick={() => void canvasStore.deleteNode(data.alias)}
            />
          </div>
        )}
      </div>

      {/* Configuration */}
      <ChipRow
        label="sel"
        chips={data.selectColumns}
        onRemove={i => void canvasStore.toggleSelectColumn(data.alias, data.selectColumns[i])}
      />
      <ChipRow
        label="where"
        chips={data.whereChips}
        onRemove={i => void canvasStore.removeWhereAt(data.alias, i)}
      />
      <ChipRow
        label="order"
        chips={data.orderChips}
        onRemove={i => void canvasStore.removeOrderAt(data.alias, i)}
      />
      <ChipRow
        label="group"
        chips={data.groupChips}
        onRemove={i => void canvasStore.toggleGroupColumn(data.alias, data.groupChips[i])}
      />
    </div>
  );
});

export default TableNode;
