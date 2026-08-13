import React, { useCallback, useEffect, useMemo } from 'react';
import ReactFlow, {
  Background,
  BackgroundVariant,
  ConnectionLineType,
  Node,
  NodeTypes,
  ReactFlowProvider,
  useNodesState,
  useReactFlow,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { observer } from 'mobx-react-lite';
import { useStores } from '../../store/store-container';
import { CanvasStore } from '../../store/canvas/canvas.store';
import {
  CanvasNode,
  CanvasStartNodeData,
  CanvasTableNodeData,
} from '../../store/canvas/canvas.model';
import { appFont } from '../../styles/app-font';
import { CanvasStoreContext } from './canvas-context';
import TableNode from './nodes/TableNode';
import StartNode from './nodes/StartNode';
import TraceEdge from './edges/TraceEdge';
import Picker from './Picker';
import MultiSelectToolbar from './MultiSelectToolbar';

const nodeTypes: NodeTypes = {
  'table-node': TableNode,
  'start-node': StartNode,
};

const edgeTypes = { trace: TraceEdge };

const START_NODE_ID = '__canvas_start__';

const Banner = ({ children }: { children: React.ReactNode }) => (
  <div
    style={{
      position: 'absolute',
      top: 8,
      right: 8,
      zIndex: 15,
      padding: '4px 10px',
      borderRadius: 3,
      fontSize: 11,
      fontFamily: 'var(--canvas-font)',
      background: 'var(--canvas-warn)',
      color: 'var(--canvas-accent-text)',
    }}
  >
    {children}
  </div>
);

const Flow: React.FC<{ canvasStore: CanvasStore }> = observer(({ canvasStore }) => {
  const reactFlowInstance = useReactFlow();
  const { canvasGraph } = canvasStore;

  // The start node is a gesture surface (clicking it calls
  // canvasStore.commitFirstTable, which overwrites session.expression
  // wholesale - see StartNode.tsx). Showing it while singleBlock is false
  // would let a click destroy a multi-block expression the canvas isn't
  // even parsing; gate it on singleBlock too, not just an empty node list.
  const derivedNodes: CanvasNode[] = useMemo(
    () =>
      canvasGraph.singleBlock && canvasGraph.nodes.length === 0
        ? [
            {
              id: START_NODE_ID,
              type: 'start-node',
              position: { x: 0, y: 0 },
              data: {},
            } as CanvasNode,
          ]
        : canvasGraph.nodes,
    [canvasGraph.nodes, canvasGraph.singleBlock],
  );

  // ReactFlow's `nodes` prop is "controlled", but that doesn't mean it can
  // be handed a fresh MobX-derived array directly on every render - without
  // an `onNodesChange` to consume, ReactFlow has no path to apply its own
  // drag/selection changes anywhere, so they got silently discarded the
  // next time anything re-rendered (confirmed live: neither node dragging
  // nor rubber-band selection persisted). `useNodesState` (the same hook
  // the classic graph already uses in Graph.box.tsx) gives ReactFlow local,
  // React-owned state it's allowed to mutate; the effect below is what
  // keeps that state in sync with the MobX-derived graph whenever *that*
  // actually changes, mirroring Graph.box.tsx's layoutedNodes -> setNodes
  // pattern exactly.
  const [nodes, setNodes, onNodesChange] = useNodesState<CanvasTableNodeData | CanvasStartNodeData>(
    [],
  );

  useEffect(() => {
    setNodes(derivedNodes);
  }, [derivedNodes, setNodes]);

  useEffect(() => {
    if (nodes.length === 0) return;
    const t = setTimeout(() => reactFlowInstance.fitView({ duration: 200 }), 50);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes.length, canvasGraph.edges.length]);

  const onNodeDragStop = (_e: React.MouseEvent, node: CanvasNode) => {
    if (node.type === 'table-node') canvasStore.setNodePosition(node.id, node.position);
  };

  // Left click selects (and, held over empty canvas, rubber-band selects) -
  // right click is reserved for panning (see the ReactFlow props below,
  // Miro-style: the primary button never fights between "move the view" and
  // "select/interact with a node").
  const onSelectionChange = useCallback(
    ({ nodes }: { nodes: Node[] }) => {
      canvasStore.setSelectedAliases(nodes.filter(n => n.type === 'table-node').map(n => n.id));
    },
    [canvasStore],
  );

  // Right-click is a pan gesture now, not a context-menu trigger - suppress
  // the browser's native menu so it doesn't pop up mid-drag/on release.
  const suppressContextMenu = (e: React.MouseEvent) => e.preventDefault();

  // Orthogonal "trace" routing (sharp right-angle bends, no curve) instead
  // of ReactFlow's default bezier - the signature move of the schematic
  // redesign: a database's tables and joins are discrete, structured
  // things, not an organic flow, so the edges read that way too. The
  // square pins on TableNode (RelationDots) are where these traces
  // "solder" onto a node, the same visual idea carried through both.
  // `unresolved` (relation === null - pipeline.md) gets its own distinct
  // color from `uncertain` (a heuristic/synthetic-resolved join - a real,
  // working join that just isn't backed by a real FK constraint) - these
  // are different kinds of "not quite right" (one is broken, one is just a
  // guess worth double-checking, matching how the classic graph's
  // store/graph.util.ts uncertainEdgeStyle draws the same distinction) and
  // sharing a color would blur that.
  const edges = canvasGraph.edges.map(e => {
    // Edges are a derived, read-only rendering of the joins in ast.joins -
    // there's no gesture that does anything with a *selected* edge, so
    // letting them be clickable/selectable at all was just a way to end up
    // with an inert highlighted edge and no idea why.
    const base = {
      ...e,
      selectable: false,
      focusable: false,
      type: 'trace',
      style: { stroke: 'var(--canvas-trace)', strokeWidth: 1.5 },
    };
    if (e.unresolved) {
      return {
        ...base,
        style: { ...base.style, stroke: 'var(--canvas-trace-unresolved)', strokeDasharray: '4 4' },
      };
    }
    if (e.uncertain) {
      return {
        ...base,
        style: { ...base.style, stroke: 'var(--canvas-trace-uncertain)', strokeDasharray: '4 4' },
      };
    }
    return base;
  });

  return (
    <div
      className={appFont.variable}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        background: 'var(--canvas-bg)',
      }}
    >
      {!canvasGraph.singleBlock && (
        <Banner>Canvas mode only supports a single expression block</Banner>
      )}
      {canvasGraph.singleBlock && !canvasGraph.parsing && (
        <Banner>Not parsing - showing last valid graph</Banner>
      )}
      <div
        style={{
          width: '100%',
          height: '100%',
          opacity: canvasGraph.singleBlock && canvasGraph.parsing ? 1 : 0.4,
          pointerEvents: canvasGraph.singleBlock && canvasGraph.parsing ? 'auto' : 'none',
        }}
      >
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodesChange={onNodesChange}
          onNodeDragStop={onNodeDragStop}
          onSelectionChange={onSelectionChange}
          onPaneContextMenu={suppressContextMenu}
          onNodeContextMenu={suppressContextMenu}
          connectionLineType={ConnectionLineType.Bezier}
          nodesConnectable={false}
          elementsSelectable={true}
          deleteKeyCode={null}
          minZoom={0.5}
          maxZoom={1.2}
          // Miro-style split: right button drags the canvas; left button is
          // free for clicking/dragging a node, or rubber-band-selecting
          // several by dragging over empty space - no modifier needed for
          // either, matching Miro's own convention rather than requiring
          // Shift.
          // `selectionOnDrag` was previously suspected of conflicting with
          // node dragging (nodes stopped being draggable at all with it on)
          // and was left out in an earlier pass, falling back to ReactFlow's
          // Shift+drag default for multi-select instead. That diagnosis was
          // wrong - the actual cause was `onNodesChange` not being wired at
          // all (see the comment on `useNodesState` above): without it,
          // ReactFlow had no path to apply *any* of its own node changes,
          // drag or selection alike, so nothing worked regardless of this
          // prop. Confirmed live once onNodesChange was fixed: dragging and
          // plain-left-drag rubber-band selection both work fine together.
          panOnDrag={[2]}
          selectionOnDrag
          // Handles the initial fit on mount - ReactFlow does this itself
          // once node dimensions are actually measured, which is more
          // reliable than the manual setTimeout-based fitView below for the
          // "just switched back to this view, nothing's been measured yet"
          // case (confirmed: switching away and back left the graph pinned
          // at the top-left instead of centered - a fresh mount, with a
          // graph already restored from the session's expression, is
          // exactly the case the effect's fixed 50ms delay was too early
          // for). The effect still does the work for later node/edge count
          // changes, where dimensions are already known.
          fitView
          proOptions={{ hideAttribution: true }}
        >
          {/* The blueprint grid - a faint dot lattice, the backdrop every
              schematic is drawn on. Dots (not lines/cross) read as graph
              paper rather than a spreadsheet or literal ruled page. */}
          <Background
            variant={BackgroundVariant.Dots}
            gap={16}
            size={1}
            color="var(--canvas-grid-dot)"
          />
        </ReactFlow>
      </div>
      <Picker />
      <MultiSelectToolbar canvasStore={canvasStore} />
    </div>
  );
});

interface CanvasProps {
  sessionId: string;
}

const Canvas: React.FC<CanvasProps> = observer(({ sessionId }) => {
  const { global } = useStores();
  const session = global.getSession(sessionId);
  const canvasStore = useMemo(() => new CanvasStore(session), [session]);
  useEffect(() => canvasStore.start(), [canvasStore]);

  return (
    <CanvasStoreContext.Provider value={canvasStore}>
      <ReactFlowProvider>
        <Flow canvasStore={canvasStore} />
      </ReactFlowProvider>
    </CanvasStoreContext.Provider>
  );
});

export default Canvas;
