import React from 'react';
import { observer } from 'mobx-react-lite';
import { NodeProps } from 'reactflow';
import { COUNT_NODE_ID, CanvasCountNodeData, aggregateSign } from '../../../store/canvas/canvas.model';
import { lineHeight } from '../../../store/canvas/layout';
import { useCanvasStore } from '../canvas-context';
import { LineAdd, ResultChip } from './TableNode';

/**
 * The query ends in `count:`: a dotted line under the whole graph. `count:`
 * is pine-lang's short form of `group: with count`, so it is drawn as a
 * group's line with no keys, `all rows with # count`, and edits the same
 * way: a key, another aggregate or another function writes it out as that
 * group (CanvasStore.countToGroup). Until then it stays `count:`, and steps
 * added later go in above it (CanvasStore.runCommit), so it stays last.
 * Its × takes the count off.
 */
const CountLineNode: React.FC<NodeProps<CanvasCountNodeData>> = observer(({ data }) => {
  const canvasStore = useCanvasStore();
  // The last keyboard stop: `x` or Delete on it removes the count.
  const focused = canvasStore.focusedAlias === COUNT_NODE_ID;
  return (
    <div
      data-testid="count-line"
      style={{ position: 'relative', width: data.width, height: lineHeight, fontFamily: 'var(--canvas-font)' }}
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
      <div
        className="nodrag"
        style={{
          // ReactFlow turns pointer events off on a node that can be neither
          // selected nor dragged. The label and its × opt back in.
          pointerEvents: 'auto',
          position: 'absolute',
          left: 24,
          top: 0,
          height: lineHeight,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '0 6px',
          background: 'var(--canvas-bg)',
          fontSize: 'calc(11px * var(--text-scale, 1))',
          color: 'var(--canvas-text-dim)',
          whiteSpace: 'nowrap',
        }}
      >
        {/* As a group's line, with no keys: `all rows with # count`. */}
        <span
          data-testid="count-label"
          title="The query's rows, counted. Click to select it; x removes it"
          onClick={e => {
            e.stopPropagation();
            canvasStore.focusNode(COUNT_NODE_ID);
          }}
          style={{ cursor: 'pointer', color: focused ? 'var(--canvas-text)' : undefined }}
        >
          all rows
        </span>
        <LineAdd
          testId="count-add-key"
          title="Count each group of a column's values instead"
          onClick={anchor => canvasStore.openGroupKeyPicker(COUNT_NODE_ID, anchor)}
        />
        <span>with</span>
        <ResultChip
          name={COUNT_NODE_ID}
          column="count"
          aggregate
          testId="count-chip"
          title="The query's rows, counted. Click to change the function"
          pins={[]}
          onClick={anchor => canvasStore.openAggregatePicker(COUNT_NODE_ID, 0, anchor)}
          onRemove={() => void canvasStore.removeCount()}
        >
          <span data-testid="count-fn" style={{ fontWeight: 600 }}>
            <span style={{ color: 'var(--canvas-trace)', marginRight: 3 }}>{aggregateSign('count')}</span>
            count
          </span>
        </ResultChip>
        <LineAdd
          testId="count-add-aggregate"
          title="Add a sum, average, smallest or largest value"
          onClick={anchor => canvasStore.openAggregatePicker(COUNT_NODE_ID, 1, anchor)}
        />
        <span
          data-testid="count-delete"
          className="picker-trigger"
          title="Remove the count: the query shows its rows again"
          onClick={e => {
            e.stopPropagation();
            void canvasStore.removeCount();
          }}
          style={{ cursor: 'pointer', opacity: 0.7 }}
        >
          &times;
        </span>
      </div>
    </div>
  );
});

export default CountLineNode;
