import { PineEdge, PineNode } from "../model";

const position = { x: 0, y: 0 };
export const nodes: PineNode[] = [
  {
    id: '1',
    data: {
      table: 'input',
      schema: "public",
      type: "selected"
    },
    position,
  },
  {
    id: '2',
    data: {
      table: 'node 2',
      schema: "public",
      type: "selected"
    },
    position,
  },
  {
    id: '2a',
    data: {
      table: 'node 2a',
      schema: "public",
      type: "selected"
    },
    position,
  },
  {
    id: '2b',
    data: {
      table: 'node 2b',
      schema: "public",
      type: "selected"
    },
    position,
  },
  {
    id: '2c',
    data: {
      table: 'node 2c',
      schema: "public",
      type: "selected"
    },
    position,
  },
  {
    id: '2d',
    data: {
      table: 'node 2d',
      schema: "public",
      type: "selected"
    },
    position,
  },
  {
    id: '3',
    data: {
      table: 'node 3',
      schema: "public",
      type: "selected"
    },
    position,
  },
  {
    id: '4',
    data: {
      table: 'node 4',
      schema: "public",
      type: "selected"
    },
    position,
  },
  {
    id: '5',
    data: {
      table: 'node 5',
      schema: "public",
      type: "selected"
    },
    position,
  },
  {
    id: '6',
    type: 'output',
    data: {
      table: 'output',
      schema: "public",
      type: "selected"
    },
    position,
  },
  { id: '7', type: 'output', data: {
    table: 'output',
    schema: "public",
    type: "selected"
  }, position },
];

export const edges: PineEdge[] = [
  { id: 'e12', source: '1', target: '2' },
  { id: 'e13', source: '1', target: '3' },
  { id: 'e22a', source: '2', target: '2a' },
  { id: 'e22b', source: '2', target: '2b' },
  { id: 'e22c', source: '2', target: '2c' },
  { id: 'e2c2d', source: '2c', target: '2d' },
  { id: 'e45', source: '4', target: '5' },
  { id: 'e56', source: '5', target: '6' },
  { id: 'e57', source: '5', target: '7' },
];