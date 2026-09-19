import { observer } from 'mobx-react-lite';
import React, { useEffect, useRef, useState } from 'react';
import { CanvasStore } from '../store/canvas/canvas.store';

/**
 * The comment on a tab's canvas - what the query is for, in the author's words.
 *
 * It is a comment at the top of the Pine expression, nothing more. pine-lang
 * hands its text back on every build, stripped of delimiters and per-line
 * markers (`Session.doc`, see pine-lang's docs/comments.md), and editing it
 * here splices it straight back into the expression (`CanvasStore.setDoc`) -
 * the same round trip a join or a select goes through, so the comment can never
 * drift from the text that produced it.
 *
 * Canvas only. The Pine panel already shows the comment - it is the first
 * thing in the expression being edited there - so rendering it a second time
 * above that editor just said the same thing twice.
 *
 * Why it looks like this: the canvas is a schematic. Nodes are IC packages
 * with square pins and a pin-1 notch (TableNode.tsx), operations are set in
 * the clipped, letter-spaced style of a drawing's printed annotations, and
 * the surface under it all is a dot grid. An annotation on a drawing is
 * printed onto the board - so this is bare board (no card, no radius, no
 * shadow) with a hairline rule marking it as a margin comment. A rule and not a
 * filled bar, because this system draws in lines, not blocks.
 */

// Which modifier to name in the hint below. navigator is absent during SSR,
// so this resolves at render, not at module load.
const isApple = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || '');

/** Lines past this are cut off, with the edge faded, until it's clicked open. */
const LINE_CLAMP = 5;

/** Shared by the printed text and the field that edits it, so the comment doesn't move on click. */
const proseStyle: React.CSSProperties = {
  margin: 0,
  fontFamily: 'var(--canvas-font)',
  fontSize: 'calc(11px * var(--text-scale, 1))',
  lineHeight: 1.6,
  color: 'var(--canvas-text-dim)',
};

/**
 * Re-wrap the comment as prose.
 *
 * A block comment is hard-wrapped by whoever typed it to fit their editor,
 * not broken where the sentences break. Keeping those breaks and then
 * wrapping again at this much narrower measure gave a ragged column of
 * half-lines (confirmed live). So: a single newline is just the author
 * running out of room and becomes a space; a blank line is a real paragraph
 * break and stays one.
 */
const asProse = (doc: string): string =>
  doc
    .split(/\n\s*\n/)
    .map(paragraph => paragraph.replace(/\s*\n\s*/g, ' ').trim())
    .filter(Boolean)
    .join('\n\n');

const containerStyle: React.CSSProperties = {
  position: 'absolute',
  // Directly below the canvas toolbar, sharing its left edge and the 8px
  // gutter every other canvas overlay uses (CanvasToolbar.tsx sits at top 8
  // and measures 32 tall). Sharing the edge is what makes the two read as one
  // column rather than as a block that happens to have landed near a toolbar.
  top: 48,
  left: 8,
  zIndex: 14,
  maxWidth: 'min(300px, calc(100% - 16px))',
  // A drawing's title block: cleared board, ruled in hairlines, square
  // corners. Opaque because a node can pan underneath it, and hairlined on
  // all four sides because without an edge that overlap read as the node
  // being clipped rather than as the comment sitting over it. Still nothing
  // like a card - no radius, no fill tint, no shadow. The left rule takes
  // the trace color, so the box reads as annotation attached to the drawing
  // rather than a panel floating above it.
  background: 'var(--canvas-bg)',
  border: '1px solid var(--canvas-node-border)',
  borderLeft: '1px solid var(--canvas-trace)',
  borderRadius: 0,
  padding: '5px 8px 5px 10px',
  // Bounded by the canvas pane, not the viewport. A long comment in a short
  // pane used to run straight off the bottom and collide with the mode
  // indicator in the opposite corner (nothing here clips it) - 48 is this
  // block's own top offset, 28 leaves that indicator its row.
  maxHeight: 'calc(100% - 48px - 28px)',
  overflowY: 'auto',
};

const DocEditor = observer(({ canvasStore }: { canvasStore: CanvasStore }) => {
  const [text, setText] = useState(canvasStore.session.doc);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, []);

  return (
    <div className="nodrag" style={{ ...containerStyle, width: 'min(300px, calc(100% - 16px))' }}>
      <textarea
        ref={ref}
        value={text}
        placeholder="What is this query for?"
        onChange={e => setText(e.target.value)}
        // Commits on the way out, so clicking back onto the canvas keeps what
        // was typed rather than throwing it away - the comment is a stray
        // thought someone is getting down, and losing it to a misplaced click
        // is worse than an edit they have to undo.
        onBlur={() => canvasStore.setDoc(text)}
        onKeyDown={e => {
          // Enter is a newline, not submit. The Enter-sends convention belongs
          // to fields that send a message (chat, a comment thread); a field
          // that authors text in place - a sticky note, a description, this -
          // keeps Enter as a line break, because the breaks are part of what
          // is being written. Committing has two other ways out (click away,
          // Cmd/Ctrl+Enter), so nothing is gained by claiming Enter, and
          // guessing wrong costs more in one direction than the other: a
          // stray Enter here is invisible once the comment re-wraps as prose,
          // whereas Enter-submits cuts a paragraph off mid-thought.
          if (e.key === 'Escape') {
            e.stopPropagation();
            canvasStore.cancelDocEdit();
          } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            canvasStore.setDoc(text);
          }
          // Canvas keybindings are single letters (s/w/o/i/x...) - without
          // this, typing a comment would fire them all.
          e.stopPropagation();
        }}
        rows={Math.min(Math.max(text.split('\n').length + 1, 3), 8)}
        style={{
          ...proseStyle,
          width: '100%',
          border: 'none',
          outline: 'none',
          resize: 'none',
          padding: 0,
          background: 'transparent',
          color: 'var(--canvas-text)',
          caretColor: 'var(--canvas-trace)',
        }}
      />
      {/* Only while editing, and only the way out - a field with no visible
          border needs to say how to leave it. Gone the moment it commits. */}
      <div
        style={{
          ...proseStyle,
          fontSize: 'calc(10px * var(--text-scale, 1))',
          opacity: 0.5,
          marginTop: 2,
        }}
      >
        {isApple ? '⌘↵' : 'ctrl+↵'} saves · esc cancels
      </div>
    </div>
  );
});

/**
 * What stands in for the comment before there is one.
 *
 * The toolbar button alone was not enough to find: one more unlabelled icon
 * in a row of them, with nothing on the canvas hinting that a comment is even
 * possible. This sits exactly where the comment will, so it teaches the place
 * as well as the action, and it is gone for good the moment anything is
 * written. Words only, no rule and no box - an empty canvas should not carry
 * a panel waiting to be filled in.
 */
const AddComment = observer(({ canvasStore }: { canvasStore: CanvasStore }) => {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      className="nodrag"
      onClick={() => canvasStore.startDocEdit()}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: 'absolute',
        top: containerStyle.top,
        // Lines up with where the comment's own text will sit, past its rule and
        // padding - so writing one doesn't make the words jump sideways.
        left: 19,
        zIndex: 14,
        cursor: 'text',
        ...proseStyle,
        opacity: hovered ? 1 : 0.45,
      }}
    >
      Add a comment
    </div>
  );
});

const PineDoc: React.FC<{ canvasStore: CanvasStore }> = observer(({ canvasStore }) => {
  const [expanded, setExpanded] = useState(false);

  if (canvasStore.docEditing) return <DocEditor canvasStore={canvasStore} />;

  const doc = asProse(canvasStore.session.doc.trim());
  if (!doc) return <AddComment canvasStore={canvasStore} />;

  // Roughly: more than the clamp can hold at this measure (~34 characters a
  // line), counting a blank line between paragraphs.
  const overflows = doc.length + doc.split('\n\n').length * 34 > 34 * LINE_CLAMP;
  const clamped = overflows && !expanded;

  return (
    <div
      className="nodrag"
      // Shrinks to the comment: a one-line comment in a box sized for five read as
      // a panel waiting to be filled in.
      style={{ ...containerStyle, width: 'fit-content', cursor: 'text' }}
      // A single click opens the clamped tail; a second one (or a click on an
      // already-whole comment) edits it. Reading it shouldn't put you in a text
      // field, and editing shouldn't be hidden behind a menu.
      onClick={() => (clamped ? setExpanded(true) : canvasStore.startDocEdit())}
      title={clamped ? doc : 'Click to edit this comment (c)'}
    >
      <p
        style={{
          ...proseStyle,
          // Paragraph breaks are the author's own - see asProse.
          whiteSpace: 'pre-wrap',
          overflowWrap: 'anywhere',
          ...(clamped
            ? {
                display: '-webkit-box',
                WebkitLineClamp: LINE_CLAMP,
                WebkitBoxOrient: 'vertical' as const,
                overflow: 'hidden',
                // Fades the cut edge instead of a "Show more" control - the
                // text itself says there's more, so nothing else has to.
                maskImage: 'linear-gradient(to bottom, #000 82%, transparent)',
                WebkitMaskImage: 'linear-gradient(to bottom, #000 82%, transparent)',
              }
            : {}),
        }}
      >
        {doc}
      </p>
    </div>
  );
});

export default PineDoc;
