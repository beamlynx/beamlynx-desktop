import React, { useEffect, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { Handle, NodeProps, Position, useUpdateNodeInternals } from 'reactflow';
import {
  CanvasHandle,
  CanvasTableNodeData,
  GlobalOperation,
  NodeAction,
  PickerState,
} from '../../../store/canvas/canvas.model';
import { getNodeHeight, lineHeight, nodeWidth } from '../../../store/canvas/layout';
import { occurrenceAt, unnestChipName } from '../../../store/canvas/pine-actions';
import { useCanvasStore } from '../canvas-context';
import { useStores } from '../../../store/store-container';
import { NOTCHED_NODE_THEMES } from '../../../styles/palette/themes';

/**
 * The alias a currently-open picker is targeting, regardless of its mode -
 * null if closed or table-picker. A checkpoint's picker (opened via
 * openCheckpointPicker) is keyed by the checkpoint's name, which is also
 * its node's alias, so this works for it unchanged.
 */
export const pickerAliasFor = (picker: PickerState): string | null => {
  if (!picker.open) return null;
  if (
    picker.mode === 'where-value' ||
    picker.mode === 'join-type' ||
    picker.mode === 'more' ||
    picker.mode === 'traverse' ||
    picker.mode === 'order-direction' ||
    picker.mode === 'select-name' ||
    picker.mode === 'unnest-name' ||
    picker.mode === 'limit-value'
  )
    return picker.alias;
  return 'alias' in picker.request ? picker.request.alias : null;
};

/**
 * Which of the operation bar's actions is open, if any: OperationBar.tsx
 * dims the others while a picker is open.
 */
export const activeGlobalOperation = (picker: PickerState): GlobalOperation | NodeAction | 'more' | null => {
  if (!picker.open) return null;
  if (picker.mode === 'where-value') return 'where';
  if (picker.mode === 'order-direction') return 'order';
  if (picker.mode === 'limit-value') return 'limit';
  // Traverse is behind the bar's "+".
  if (picker.mode === 'traverse') return 'more';
  if (picker.mode === 'more') return picker.global ? 'more' : null;
  if (picker.mode !== 'list') return null;
  const kind = picker.request.kind;
  if (kind === 'path-route') return 'path';
  if (kind === 'unnest') return 'more';
  return kind === 'select' || kind === 'where' || kind === 'order' || kind === 'group' || kind === 'path' || kind === 'join'
    ? kind
    : null;
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
const RelationDots = ({
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
                  fontSize: 'calc(9px * var(--text-scale, 1))',
                  // Kept tight to the glyph (not the browser default ~1.2)
                  // so a larger Text Size setting doesn't push this single
                  // line's line-box into the row above/below it - these
                  // labels sit every handleRowHeight (14px) apart via
                  // absolute position + translateY(-50%), not normal flow,
                  // so nothing here reserves extra vertical space for a
                  // taller line-height the way flowed text would.
                  lineHeight: 1,
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

/**
 * A checkpoint's line (beamlynx-plans #33): a dotted line across the graph,
 * below the stage it seals, in place of a result node. Its label says what
 * sealed the stage; a limit's opens the limit editor, and × removes the
 * checkpoint. The joins onto the sealed result drop out of its bottom edge,
 * each from a pin under the label, with the column it joins on.
 */
const CheckpointLine = observer(({ data, focused }: { data: CanvasTableNodeData; focused: boolean }) => {
  const canvasStore = useCanvasStore();
  const nested = data.nested;
  const width = data.checkpoint?.line?.width ?? nodeWidth;
  const pins = [
    ...data.rightHandles.map(h => ({ h, type: 'source' as const })),
    ...data.leftHandles.map(h => ({ h, type: 'target' as const })),
  ];
  return (
    <div
      data-testid={`checkpoint-line-${data.alias}`}
      style={{ position: 'relative', width, height: lineHeight, fontFamily: 'var(--canvas-font)' }}
    >
      <div
        aria-hidden
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: lineHeight / 2,
          borderTop: `${focused ? 2.5 : 1.5}px dashed ${focused ? 'var(--canvas-node-border-current)' : 'var(--canvas-container-border)'}`,
        }}
      />
      {nested && (
        <div
          className="nodrag"
          data-testid={`nested-badge-${data.alias}`}
          style={{
            position: 'absolute',
            // Right of the join pins, which sit at the line's left end.
            left: 16 + pins.length * 14,
            top: 0,
            height: lineHeight,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '0 6px',
            background: 'var(--canvas-bg)',
            fontSize: 'calc(11px * var(--text-scale, 1))',
            color: focused ? 'var(--canvas-text)' : 'var(--canvas-text-dim)',
            whiteSpace: 'nowrap',
          }}
        >
          <span
            data-testid={`nested-label-${nested.name}`}
            className={nested.limit !== undefined ? 'picker-trigger' : undefined}
            title={nested.limit !== undefined ? 'Change the limit' : `The query goes on from this result: ${nested.name}`}
            onClick={
              nested.limit !== undefined
                ? e => {
                    e.stopPropagation();
                    canvasStore.openLimitEditor(data.alias, { x: e.clientX, y: e.clientY }, nested.name);
                  }
                : undefined
            }
            style={{
              cursor: nested.limit !== undefined ? 'pointer' : 'default',
              color: nested.limit !== undefined ? 'var(--canvas-trace)' : undefined,
            }}
          >
            {nested.label}
          </span>
          <span
            data-testid={`nested-delete-${nested.name}`}
            title="Remove this checkpoint: the tables join up again"
            onClick={e => {
              e.stopPropagation();
              void canvasStore.deleteCheckpoint(nested.name);
            }}
            style={{ cursor: 'pointer', opacity: 0.7 }}
          >
            &times;
          </span>
        </div>
      )}
      {pins.map(({ h, type }, i) => (
        <Handle
          key={`${type}:${h.id}`}
          type={type}
          position={Position.Bottom}
          id={h.id}
          style={{
            width: 6,
            height: 6,
            borderRadius: 1,
            background: 'var(--canvas-pin)',
            left: 14 + i * 14,
            bottom: lineHeight / 2 - 3,
            top: 'auto',
          }}
        />
      ))}
      {/* Fallback anchors for an edge with no column to name a handle by (see the table card's). */}
      <Handle type="target" position={Position.Bottom} style={{ opacity: 0, pointerEvents: 'none', left: 14 }} />
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0, pointerEvents: 'none', left: 14 }} />
    </div>
  );
});

// Node removal reads as a destructive, one-off action rather than another
// "add a clause" action (and "delete" is easy to mistake for Pine/SQL
// DELETE) - a small × close button, off to the side, keeps it visually
// distinct from the join/select/where/order row instead of sitting in line
// with them as just another button. Plain glyph, no fill/circle/warning
// color: this only ever appears already gated behind `engaged` (hover or
// focus), so it doesn't need its own attention-grabbing treatment on top of
// that - a quiet × reads as "close", not an alarm. Sits inside the card's
// own top-right corner (not straddling the border) so it doesn't compete
// with the notch/pin system that lives right at the edges.
const DeleteButton = ({ onClick, testId }: { onClick: () => void; testId?: string }) => (
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
      // Base kept a bit under the box's fixed 16px (rather than the old
      // fixed 13px) so it still comfortably fits at Text Size "large"
      // (calc(11px * 1.25) = 13.75px) without growing the box itself.
      fontSize: 'calc(11px * var(--text-scale, 1))',
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
  readOnlyChips = [],
  onRemove,
  onRemoveReadOnly,
  onSelect,
  onSelectReadOnly,
  highlightIndex,
  warn = false,
}: {
  label: string;
  chips: string[];
  /** Shown after `chips`, without a panel: what the query reads from the elements of an `unnest:`. */
  readOnlyChips?: string[];
  onRemove?: (index: number) => void;
  /** The × on a chip of `readOnlyChips`: it has no panel, but can be removed. */
  onRemoveReadOnly?: (index: number) => void;
  /** Reopens this chip's own config panel with its current value prefilled - see CanvasStore.openWhereEditor. Only offered for "where" today; select/order/group chips are already fully edited by toggling. */
  onSelect?: (index: number, anchor: { x: number; y: number }) => void;
  /** A click on a chip of `readOnlyChips`: on select, a field for its name. */
  onSelectReadOnly?: (index: number, anchor: { x: number; y: number }) => void;
  /** The chip at this index is CanvasStore.focusedConfigItem's current target - drawn with the same "current" ring TableNode's own border uses for keyboard focus. */
  highlightIndex?: number;
  /** Drawn in the warning colour: the row says what an update! or delete! changes. */
  warn?: boolean;
}) => {
  // Hover rings the chip under the pointer, but only locally - it must not
  // move CanvasStore's keyboard cursor. A hidden pointer (some window
  // managers hide it on key press) resting where the graph re-lays out would otherwise pull
  // focus onto an older node, and the next `|` would join from there.
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  if (chips.length === 0 && readOnlyChips.length === 0) return null;
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
          fontSize: 'calc(9px * var(--text-scale, 1))',
          fontFamily: 'var(--canvas-font)',
          textTransform: 'uppercase',
          fontWeight: 700,
          letterSpacing: '0.3px',
          color: warn ? 'var(--canvas-warn)' : 'var(--canvas-text-dim)',
        }}
      >
        {label}
      </span>
      {chips.map((chip, i) => (
        <div
          key={`${chip}-${i}`}
          onClick={
            onSelect
              ? e => {
                  e.stopPropagation();
                  onSelect(i, { x: e.clientX, y: e.clientY });
                }
              : undefined
          }
          onMouseEnter={() => setHoveredIndex(i)}
          onMouseLeave={() => setHoveredIndex(null)}
          style={{
            fontSize: 'calc(10px * var(--text-scale, 1))',
            fontFamily: 'var(--canvas-font)',
            background: 'var(--canvas-chip-bg)',
            padding: '2px 6px',
            borderRadius: '3px',
            border: `1px solid ${highlightIndex === i || hoveredIndex === i ? 'var(--canvas-node-border-current)' : 'var(--canvas-chip-border)'}`,
            color: 'var(--canvas-text)',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            cursor: onSelect ? 'pointer' : undefined,
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
      {readOnlyChips.map((chip, i) => (
        <div
          key={`ro-${chip}-${i}`}
          onClick={
            onSelectReadOnly
              ? e => {
                  e.stopPropagation();
                  onSelectReadOnly(i, { x: e.clientX, y: e.clientY });
                }
              : undefined
          }
          style={{
            cursor: onSelectReadOnly ? 'pointer' : undefined,
            fontSize: 'calc(10px * var(--text-scale, 1))',
            fontFamily: 'var(--canvas-font)',
            background: 'var(--canvas-chip-bg)',
            padding: '2px 6px',
            borderRadius: '3px',
            border: `1px solid ${warn ? 'var(--canvas-warn)' : 'var(--canvas-chip-border)'}`,
            color: 'var(--canvas-text)',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
          }}
        >
          <span
            style={{ width: 4, height: 4, flexShrink: 0, background: warn ? 'var(--canvas-warn)' : 'var(--canvas-pin)' }}
          />
          <span>{chip}</span>
          {onRemoveReadOnly && (
            <span
              onClick={e => {
                e.stopPropagation();
                onRemoveReadOnly(i);
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
//
// Only drawn for themes in NOTCHED_NODE_THEMES (styles/palette/themes.ts) -
// it's a technical/schematic detail that suited the app when there was one
// blueprint-inspired identity for everything; now that a theme can be warm
// and paper-like (Sepia) or clean and airy (Light), carrying the same PCB
// notch into those read as leftover blueprint DNA rather than a deliberate
// choice (direct feedback: "if you change the theme, these nodes should
// also change"). Falls back to the plain rounded card (borderRadius alone)
// everywhere else.
const notchSize = 10;
const cardClipPath = `polygon(0 0, 100% 0, 100% 100%, ${notchSize}px 100%, 0 calc(100% - ${notchSize}px))`;

const TableNode: React.FC<NodeProps<CanvasTableNodeData>> = observer(({ id, data }) => {
  const canvasStore = useCanvasStore();
  const { global } = useStores();
  const hasNotch = NOTCHED_NODE_THEMES.includes(global.themeId);
  const updateNodeInternals = useUpdateNodeInternals();
  const handleKey = [...data.leftHandles, ...data.rightHandles].map(h => h.id).join(',');
  const [hovered, setHovered] = useState(false);

  useEffect(() => {
    updateNodeInternals(id);
  }, [id, handleKey, updateNodeInternals]);

  useEffect(() => {
    // React never fires onMouseLeave for an element removed out from under
    // the pointer (deleting this node while hovering, or the graph
    // re-deriving on eval) - without this, hoveredAlias sticks to an alias
    // that's no longer on screen and Result.tsx spotlights it forever.
    return () => {
      if (canvasStore.hoveredAlias === data.alias) {
        canvasStore.setHoveredAlias(null);
      }
    };
  }, [canvasStore, data.alias]);

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

  // Only meaningful while this node itself is the keyboard focus - a config
  // cursor is always relative to canvasStore.focusedAlias, so a different
  // node's own where chips must never pick up its highlight.
  const cursorItem = isFocusTarget ? canvasStore.focusedConfigItem : null;
  // Once the config cursor has moved onto one specific item (a chip, or the
  // incoming join's own icon on TraceEdge.tsx), that item's own highlight
  // ring IS the selection - keeping the whole node's thick "current" border
  // on top of it read as two different things selected at once. The node
  // still needs SOME visual trace of being the focus root (so Left/Right's
  // effect is legible: "highlight moved within this node"), just not the
  // same strong treatment a config item's own ring already carries.
  const hasConfigCursor = cursorItem !== null;
  // A picker actually open for this alias - distinct from merely being
  // config-cursor-highlighted (see `engaged` below, which treats these
  // differently: the action bar is a hint for "what can I do to this
  // node" and has no business showing while you're just looking at
  // something it already has, only once you've actually opened an editor
  // for it).
  const pickerOpenHere = pickerAliasFor(canvasStore.picker) === data.alias;

  // The action bar is a HINT ("here's what you can do on this node"), not
  // a persistent toolbar - it belongs on a bare node (hover, or plain
  // keyboard focus with nothing drilled into), and while an editor is
  // actually open for one specific operation (dimmed to just that one -
  // see `activeOperation` below). It does NOT belong while the config
  // cursor (Left/Right) is merely highlighting an existing chip/join icon
  // without having opened anything yet - at that point the chip/icon's own
  // highlight is already the whole story, and five "things you could add"
  // buttons floating above it read as "part of this is still selectable",
  // which it isn't. `hasConfigCursor` only suppresses the PLAIN-focus half
  // of this condition - hover and an actually-open picker both still show
  // it regardless, since neither of those is "just browsing".
  const nested = data.nested;
  const engaged = hovered || pickerOpenHere || (isFocusTarget && !hasConfigCursor);

  // The three always-visible operations, in their fixed display order - a
  // plain lookup (not derived from anywhere else) so both render paths below
  // (all three, or just the one mid-flight) read off the same list instead
  // of two hand-duplicated JSX blocks drifting apart. order/group/path move
  // behind the "+" trigger rendered after this row (MORE_ACTIONS) - a graph
  // with several nodes read as wall-to-wall verbs with all six shown at
  // once, and these three are every keyboard shortcut's own natural
  // "most-reached-for" set; the other three keep working identically via
  // their own bare-letter shortcut (o/g/p, see useCanvasKeybindings.ts) or a
  // click through "+" - nothing about them actually moved, only which ones
  // get a standing button.
  // A checkpoint's node works on the sealed result: its actions go through
  // openCheckpointPicker, which first writes the checkpoint's name into the
  // text if it isn't there yet (see CanvasStore.ensureCheckpointPinned).
  const checkpoint = data.checkpoint;
  // A node has no actions of its own: every action, join included, is in
  // the operation bar (OperationBar.tsx), which offers the selected node's
  // join, traverse, describe and references next to the query's own
  // operations. The row above the card stays, for a checkpoint's
  // "loading..." while its name is written into the text.
  // True while this checkpoint's first action waits for its name to be
  // written into the text - see CanvasStore.checkpointPinning.
  const pinning = !!checkpoint && canvasStore.checkpointPinning === data.alias;
  // A checkpoint of the last query block is drawn as a line (beamlynx-plans #33).
  const line = checkpoint?.line;

  return (
    <div
      style={line ? { width: line.width, paddingLeft: 0 } : { width: nodeWidth }}
      onMouseEnter={() => {
        setHovered(true);
        // Hover only reveals this node's action bar and spotlights its
        // columns in Result.tsx - it deliberately does NOT move the keyboard
        // cursor (focusNode). The pointer can "enter" a node without the
        // user doing anything: it can be hidden while typing, and the graph
        // re-lays out after every join, so an older node can slide under a
        // still, invisible pointer. Moving focus there made the next `|`
        // join from that older node (commitJoin adds a `from:` whenever
        // focus isn't the latest table). Focus moves on a click instead.
        canvasStore.setHoveredAlias(data.alias);
      }}
      onClick={() => canvasStore.focusNode(data.alias)}
      onMouseLeave={() => {
        setHovered(false);
        // Guard against the next node's mouseenter (setting hoveredAlias)
        // firing before this one's mouseleave when the pointer crosses
        // straight from one node into an adjacent one - only clear if we're
        // still the one being spotlighted.
        if (canvasStore.hoveredAlias === data.alias) {
          canvasStore.setHoveredAlias(null);
        }
      }}
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
          // A checkpoint's connector runs down through this row to the box
          // (CheckpointDividerNode.tsx); while the bar shows, it covers the
          // line instead of the line striking through its labels.
          ...(checkpoint ? { background: 'var(--canvas-bg)', alignSelf: 'center', width: 'fit-content', margin: '0 auto 4px', padding: '0 4px' } : {}),
        }}
      >
        {pinning && (
          <div data-testid={`checkpoint-pinning-${data.alias}`} style={{ opacity: 0.7, fontSize: 'calc(10px * var(--text-scale, 1))' }}>
            loading...
          </div>
        )}
      </div>

      {/* Identity - the outer wrapper here is the positioning context for the
          badge/delete-x below; the notch is drawn via clip-path on the INNER
          card div only, never on this wrapper, because clip-path clips to
          its own element's border box - anything a child positions outside
          that box (the badge and delete-x both poke out past the corners on
          purpose, see below) would get silently clipped away too if it sat
          on the same element as the notch. Confirmed live: both were
          invisible until split out this way. */}
      {line ? (
        <CheckpointLine data={data} focused={isFocusTarget && !hasConfigCursor} />
      ) : (
      <div style={{ position: 'relative' }}>
        <div
          style={{
            boxSizing: 'border-box',
            width: nodeWidth,
            minHeight: height,
            padding: '10px 10px 6px 10px',
            // Plain, unfocused styling the instant a config item owns the
            // highlight (hasConfigCursor) - even a thinner/quieter accent
            // border here was still a SECOND thing visibly reading as
            // "selected" alongside the chip's own ring or the join icon's
            // own halo (confirmed live - "it is selecting the join and the
            // node at the same time"). Only one thing shows as current at
            // once: the specific config item while there is one, the whole
            // node otherwise.
            border: isFocusTarget && !hasConfigCursor
              ? '3px solid var(--canvas-node-border-current)'
              : '1.5px solid var(--canvas-node-border)',
            background: isFocusTarget && !hasConfigCursor ? 'var(--canvas-node-bg-current)' : 'var(--canvas-node-bg)',
            borderRadius: hasNotch ? '3px' : '8px',
            clipPath: hasNotch ? cardClipPath : undefined,
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
            {/* A nested query's node is named once: its name is its alias
                (`result_1`, `top`). */}
            {!nested && (
              <span
                style={{
                  flexShrink: 0,
                  fontSize: 'calc(11px * var(--text-scale, 1))',
                  fontFamily: 'var(--canvas-font)',
                  color: 'var(--canvas-text-dim)',
                }}
              >
                {/* A node from an earlier query block shows its alias in that
                    block, without the block's prefix (see scopeOf). */}
                {`(${data.alias.replace(/^b\d+\//, '')})`}
              </span>
            )}
          </div>

          {/* A nested query says what produced it, under its name: the
              expand toggle, the operation (`limit 1 per c.id`, `|= top`) -
              a limit's opens the limit editor - and, for a checkpoint, ×
              to remove it. */}
          {nested && (
            <div
              className="nodrag"
              data-testid={`nested-badge-${data.alias}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                marginTop: 2,
                fontSize: 'calc(10px * var(--text-scale, 1))',
                fontFamily: 'var(--canvas-font)',
                color: 'var(--canvas-text-dim)',
                whiteSpace: 'nowrap',
                minWidth: 0,
              }}
            >
              <span
                data-testid={`nested-toggle-${nested.name}`}
                title={nested.expanded ? 'Collapse (e)' : 'Expand: show what this holds (e)'}
                onClick={e => {
                  e.stopPropagation();
                  canvasStore.toggleNested(nested.name);
                }}
                style={{ cursor: 'pointer', color: 'var(--canvas-container-border)' }}
              >
                {nested.expanded ? '▾' : '▸'}
              </span>
              <span
                data-testid={`nested-label-${nested.name}`}
                className={nested.limit !== undefined ? 'picker-trigger' : undefined}
                title={nested.limit !== undefined ? 'Change the limit' : undefined}
                onClick={
                  nested.limit !== undefined
                    ? e => {
                        e.stopPropagation();
                        canvasStore.openLimitEditor(data.alias, { x: e.clientX, y: e.clientY }, nested.name);
                      }
                    : e => {
                        e.stopPropagation();
                        canvasStore.toggleNested(nested.name);
                      }
                }
                style={{
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  cursor: 'pointer',
                  color: nested.limit !== undefined ? 'var(--canvas-trace)' : undefined,
                }}
              >
                {nested.label}
              </span>
              {nested.kind === 'checkpoint' && (
                <span
                  data-testid={`nested-delete-${nested.name}`}
                  title="Remove this checkpoint"
                  onClick={e => {
                    e.stopPropagation();
                    void canvasStore.deleteCheckpoint(nested.name);
                  }}
                  style={{ cursor: 'pointer', opacity: 0.7 }}
                >
                  &times;
                </span>
              )}
            </div>
          )}

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
      )}

      {/* Configuration. Under a line, the chips sit under its label. */}
      <div style={line ? { paddingLeft: 24, maxWidth: nodeWidth * 2 } : undefined}>
      <ChipRow
        label="unnest"
        chips={data.unnestChips ?? []}
        // A click renames the elements: `as company`.
        onSelect={(i, anchor) => {
          const name = unnestChipName((data.unnestChips ?? [])[i] ?? '');
          if (name) canvasStore.openUnnestNameEditor(data.alias, name, anchor);
        }}
        highlightIndex={
          cursorItem?.kind === 'unnest'
            ? (data.unnestChips ?? []).findIndex(chip => unnestChipName(chip) === cursorItem.name)
            : undefined
        }
        onRemove={i => {
          // A chip reads `data.changes as change`: the name is after `as`.
          const name = unnestChipName((data.unnestChips ?? [])[i] ?? '');
          if (name) void canvasStore.removeUnnest(data.alias, name);
        }}
      />
      <ChipRow
        label="sel"
        chips={data.selectColumns.map((column, i) => {
          const name = data.selectNames?.[i];
          return name ? `${column} as ${name}` : column;
        })}
        readOnlyChips={(data.elementChips?.select ?? []).map((chip, i) => {
          const name = data.elementChips?.selectNames?.[i];
          return name ? `${chip} as ${name}` : chip;
        })}
        onRemoveReadOnly={i => void canvasStore.removeElementPart(data.alias, 'select', data.elementChips?.select[i] ?? '')}
        // Like a column's chip: a click names the item with `as`.
        onSelectReadOnly={(i, anchor) => {
          const chips = data.elementChips?.select ?? [];
          void canvasStore.openSelectNameEditor(data.alias, chips[i], occurrenceAt(chips, i), anchor, true);
        }}
        // The same column can be selected more than once: a chip is one copy.
        onRemove={i =>
          void canvasStore.removeSelectColumn(data.alias, data.selectColumns[i], occurrenceAt(data.selectColumns, i))
        }
        onSelect={(i, anchor) =>
          canvasStore.openSelectNameEditor(data.alias, data.selectColumns[i], occurrenceAt(data.selectColumns, i), anchor)
        }
        highlightIndex={
          cursorItem?.kind === 'select'
            ? data.selectColumns.findIndex(
                (column, i) => column === cursorItem.column && occurrenceAt(data.selectColumns, i) === cursorItem.occurrence,
              )
            : undefined
        }
      />
      <ChipRow
        label="where"
        chips={data.whereChips}
        readOnlyChips={data.elementChips?.where}
        onRemoveReadOnly={i => void canvasStore.removeElementWhereAt(data.alias, i)}
        onRemove={i => void canvasStore.removeWhereAt(data.alias, i)}
        onSelect={(i, anchor) => canvasStore.openWhereEditor(data.alias, i, anchor)}
        highlightIndex={cursorItem?.kind === 'where' ? cursorItem.index : undefined}
      />
      <ChipRow
        label="order"
        chips={data.orderChips}
        readOnlyChips={data.elementChips?.order}
        onRemoveReadOnly={i => void canvasStore.removeElementPart(data.alias, 'order', data.elementChips?.order[i] ?? '')}
        onRemove={i => void canvasStore.removeOrderAt(data.alias, i)}
        onSelect={(i, anchor) => {
          const chip = data.orderChips[i] ?? '';
          const current = /\bdesc$/i.test(chip) ? 'desc' : 'asc';
          canvasStore.openOrderEditor(data.alias, i, chip.replace(/\s+(asc|desc)$/i, ''), current, anchor);
        }}
        highlightIndex={
          cursorItem?.kind === 'order'
            ? data.orderChips.findIndex(chip => chip.replace(/\s+(asc|desc)$/i, '') === cursorItem.column)
            : undefined
        }
      />
      <ChipRow
        label="group"
        chips={data.groupChips}
        readOnlyChips={data.elementChips?.group}
        onRemoveReadOnly={i => void canvasStore.removeElementPart(data.alias, 'group', data.elementChips?.group[i] ?? '')}
        onRemove={i => void canvasStore.toggleGroupColumn(data.alias, data.groupChips[i])}
        onSelect={(i, anchor) => canvasStore.openColumnPicker('group', data.alias, anchor, data.groupChips[i])}
        highlightIndex={cursorItem?.kind === 'group' ? data.groupChips.indexOf(cursorItem.column) : undefined}
      />
      {/* What the query's update! or delete! does to this table's rows. */}
      {data.write && (
        <ChipRow
          warn
          label={data.write.kind}
          chips={[]}
          readOnlyChips={
            data.write.kind === 'update' ? data.write.items : [`these rows, by ${data.write.items.join(', ')}`]
          }
        />
      )}
      {/* The query's describe: or references: lists this table's columns or relations. */}
      {data.describe && (
        <ChipRow
          label={data.describe}
          chips={[]}
          readOnlyChips={[data.describe === 'describe' ? 'its columns' : 'how it joins']}
          onRemoveReadOnly={() => void canvasStore.removeDescribe(data.alias)}
        />
      )}
      </div>
    </div>
  );
});

export default TableNode;
