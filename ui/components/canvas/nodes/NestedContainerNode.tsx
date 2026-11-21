import React from 'react';
import { observer } from 'mobx-react-lite';
import { NodeProps } from 'reactflow';
import { CanvasContainerNodeData } from '../../../store/canvas/canvas.model';
import { useCanvasStore } from '../canvas-context';

// The box and the connector are one stroke: same colour, same weight.
const stroke = '1.5px dashed var(--canvas-container-border)';

/**
 * An expanded nested query - a checkpoint, or a named result from an earlier
 * query block - drawn as a dashed box around what it holds, directly above
 * its node, with a short connector from the box's bottom edge down to the
 * node: this box becomes that node. A named block the last query doesn't
 * join has no node, and so no connector. See layout.ts's buildCanvasGraph.
 *
 * The box has no fill, so the tables inside read clearly, and it sits
 * behind them (zIndex -1), which stay fully interactive. Only the header -
 * the label on the top edge, with its collapse toggle - takes clicks; the
 * rest lets them through, so a rubber-band selection can start inside.
 */
const NestedContainerNode: React.FC<NodeProps<CanvasContainerNodeData>> = observer(({ data }) => {
  const canvasStore = useCanvasStore();
  return (
    <div
      data-testid={`nested-container-${data.name}`}
      className="canvas-container"
      style={{
        width: data.width,
        height: data.height,
        position: 'relative',
        pointerEvents: 'none',
      }}
    >
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          border: stroke,
          borderRadius: 8,
          boxSizing: 'border-box',
        }}
      />
      {data.connector > 0 && (
        <div
          aria-hidden
          data-testid={`nested-connector-${data.name}`}
          style={{
            position: 'absolute',
            left: data.connectorX - 0.75,
            top: data.height,
            height: data.connector,
            borderLeft: stroke,
          }}
        />
      )}
      <div
        className="nodrag nopan"
        data-testid={`nested-container-header-${data.name}`}
        title="Collapse (e on its node)"
        onClick={e => {
          e.stopPropagation();
          canvasStore.toggleNested(data.name);
        }}
        style={{
          position: 'absolute',
          top: -8,
          left: 12,
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          padding: '0 6px',
          height: 16,
          background: 'var(--canvas-bg)',
          fontSize: 'calc(10px * var(--text-scale, 1))',
          fontFamily: 'var(--canvas-font)',
          fontWeight: 600,
          color: 'var(--canvas-container-border)',
          whiteSpace: 'nowrap',
          cursor: 'pointer',
          pointerEvents: 'auto',
        }}
      >
        <span aria-hidden>▾</span>
        <span>{data.label}</span>
      </div>
    </div>
  );
});

export default NestedContainerNode;
