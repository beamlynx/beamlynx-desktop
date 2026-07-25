// A selected node's title/alias text occupies the top of the box, so relation
// handles/labels are laid out below it — growing the box height only when a
// side has more than one handle to show (the common single-relation case
// stays at the original fixed height). Shared between graph.util.ts (layout)
// and SelectedNodeComponent.tsx (rendering) so they can't drift apart.
export const selectedNodeHeaderHeight = 48;
export const handleRowHeight = 14;
const minSelectedNodeHeight = 60;

export const getSelectedNodeHeight = (leftHandleCount: number, rightHandleCount: number) => {
  const maxHandles = Math.max(leftHandleCount, rightHandleCount, 1);
  return Math.max(minSelectedNodeHeight, selectedNodeHeaderHeight + maxHandles * handleRowHeight);
};
