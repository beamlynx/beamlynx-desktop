import { NodeHandle } from '../model';

// Shared between graph.util.ts (layout) and the node components (rendering)
// so they can't drift apart.
export const nodeWidth = 172;

export const handleRowHeight = 14;
// Extra breathing room below the last handle's label — only applies once
// labels are actually shown.
const handleListBottomPadding = 10;

/**
 * Number of label rows a side needs: 0 when there's nothing to show (no
 * handles, or a single handle whose column is genuinely unknown — see
 * RelationHandles.needsHandleRows), otherwise the handle count.
 */
export const effectiveHandleCount = (handles: NodeHandle[]): number =>
  handles.length > 1 || (handles.length === 1 && handles[0].column !== '') ? handles.length : 0;

// A selected node's title/alias text occupies the top of the box, so relation
// handles/labels are laid out below it — growing the box height only when a
// side actually has label rows to show (a single handle with no known column
// stays at the original fixed height).
export const selectedNodeHeaderHeight = 48;
const minSelectedNodeHeight = 60;

export const getSelectedNodeHeight = (leftEffectiveCount: number, rightEffectiveCount: number) => {
  const maxHandles = Math.max(leftEffectiveCount, rightEffectiveCount);
  if (maxHandles === 0) return minSelectedNodeHeight;
  return selectedNodeHeaderHeight + maxHandles * handleRowHeight + handleListBottomPadding;
};

// A variable/checkpoint container's collapsed `= name` header is shorter than
// a selected node's title+alias block.
export const variableNodeHeaderHeight = 26;
const minVariableNodeHeight = 28; // matches the pre-existing collapsed header height

export const getVariableNodeHeight = (leftEffectiveCount: number, rightEffectiveCount: number) => {
  const maxHandles = Math.max(leftEffectiveCount, rightEffectiveCount);
  if (maxHandles === 0) return minVariableNodeHeight;
  return variableNodeHeaderHeight + maxHandles * handleRowHeight + handleListBottomPadding;
};
