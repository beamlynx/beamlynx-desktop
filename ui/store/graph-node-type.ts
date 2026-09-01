// Split out of components/Graph.box.tsx: graph.util.ts (a plain store
// module, no React/MUI/reactflow) needs this as a real runtime value, not
// just a type, so it can't stay in a .tsx component file without dragging
// that whole component tree (and its `reactflow/dist/style.css` import)
// into anything that imports graph.util.ts transitively -- see session.ts.
export const NodeType = {
  Selected: 'selected-node',
  Suggested: 'suggested-node',
  Variable: 'variable-node',
};
