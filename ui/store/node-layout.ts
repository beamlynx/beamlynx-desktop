// Shared between graph.util.ts (layout) and the node components (rendering)
// so they can't drift apart.
export const nodeWidth = 172;

// A selected node's title/alias text occupies the top of the box, so relation
// handles/labels are laid out below it — growing the box height only when a
// side has more than one handle to show (the common single-relation case
// stays at the original fixed height).
export const selectedNodeHeaderHeight = 48;
export const handleRowHeight = 14;
const minSelectedNodeHeight = 60;
// Extra breathing room below the last handle's label — only applies once
// labels are actually shown (i.e. more than one handle on a side).
const handleListBottomPadding = 10;

export const getSelectedNodeHeight = (leftHandleCount: number, rightHandleCount: number) => {
  const maxHandles = Math.max(leftHandleCount, rightHandleCount, 1);
  if (maxHandles <= 1) return minSelectedNodeHeight;
  return selectedNodeHeaderHeight + maxHandles * handleRowHeight + handleListBottomPadding;
};

// A variable/checkpoint container's collapsed `= name` header is shorter than
// a selected node's title+alias block.
export const variableNodeHeaderHeight = 26;
const minVariableNodeHeight = 28; // matches the pre-existing collapsed header height

export const getVariableNodeHeight = (leftHandleCount: number, rightHandleCount: number) => {
  const maxHandles = Math.max(leftHandleCount, rightHandleCount, 1);
  if (maxHandles <= 1) return minVariableNodeHeight;
  return variableNodeHeaderHeight + maxHandles * handleRowHeight + handleListBottomPadding;
};
