import { NodeHandle } from '../model';

// Shared between the canvas layout (store/canvas/layout.ts) and the node
// components (rendering) so they can't drift apart.
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
