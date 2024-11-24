import React, { useState } from 'react';
import { Handle, NodeProps, Position } from 'reactflow';
import { SelectedNodeData } from '../model';

type PineNodeProps = NodeProps<SelectedNodeData>;

/**
 * Container for:
 * - Table node
 * - Options (i.e. show columns)
 *
 * The options are shown on the left of the table node.
 * The options are hidden by default and shown when the user hovers over
 * the node.
 */
const TableNode = ({
  showOptions,
  setShowOptions,
  expanded,
  setExpanded,
  order,
  table,
  schema,
  color,
  alias,
}: {
  showOptions: boolean;
  setShowOptions: (show: boolean) => void;
  expanded: boolean;
  setExpanded: (expanded: boolean) => void;
  order: number;
  table: string;
  schema: string;
  color?: string | null;
  alias: string;
}) => (
  <div
    style={{
      padding: '12px 10px 5px 10px',
      display: 'flex',
      flexDirection: 'row',
      alignItems: 'center',
    }}
    onMouseEnter={() => setShowOptions(true)}
    onMouseLeave={() => setShowOptions(false)}
  >
    {/* Options */}
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        margin: '5px 4px',
        cursor: 'pointer',
        fontSize: '12px',
        color: '#666',
        opacity: showOptions ? 1 : 0,
        backgroundColor: '#fff',
        border: '1px solid #ddd',
        borderRadius: '4px',
        width: '20px',
        minWidth: '20px',
        padding: '0 8px',
        height: '20px',
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
        fontWeight: 'bold',
      }}
      onClick={() => setExpanded(!expanded)}
    >
      {expanded ? '-' : '+'}
    </div>

    {/* Node */}
    <div
      style={{
        position: 'relative',
        padding: '12px 10px 5px 10px',
        border: '2px solid black',
        background: 'lightgray',
        borderRadius: '5px',
      }}
    >
      {/* Table */}
      <div>
        {table}
        <div
          style={{
            textAlign: 'right',
            fontSize: '8px',
            fontFamily: 'Courier, monospace',
          }}
        >
          {alias}
        </div>
      </div>

      {/* Order */}
      {
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            transform: 'translate(-50%, -50%)',
            width: '20px',
            height: '20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: '50%',
            background: '#800000',
            color: 'white',
            fontSize: '12px',
            boxShadow: '0 2px 4px rgba(0,0,0,0.25)',
            fontWeight: 'bold',
          }}
        >
          {order}
        </div>
      }

      {/* Schema */}
      {schema !== 'public' && (
        <div
          style={{
            position: 'absolute',
            right: 0,
            top: -5,
            padding: '2px 5px',
            fontSize: '8px',
            borderRadius: '5px',
            transform: 'translateY(-100%)',
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
            background: color ?? '#fff',
          }}
        >
          {schema}
        </div>
      )}

      <Handle
        type="target"
        position={Position.Left}
        style={{
          width: '2px',
          height: '2px',
          background: 'darkgray',
          borderRadius: '50%',
        }}
      />
      <Handle
        type="source"
        position={Position.Right}
        style={{
          width: '2px',
          height: '2px',
          background: 'darkgray',
          borderRadius: '50%',
        }}
      />
    </div>
  </div>
);

const Columns = ({ expanded, columns }: { expanded: boolean; columns: string[] }) => (
  <div
    style={{
      maxHeight: expanded ? '500px' : '0',
      overflow: 'hidden',
    }}
  >
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '4px',
        justifyContent: 'center',
        padding: '4px',
      }}
    >
      {columns.map(column => (
        <div
          key={column}
          style={{
            fontSize: '8px',
            fontFamily: 'Courier, monospace',
            background: '#f0f0f0',
            padding: '2px 6px',
            borderRadius: '8px',
            border: '1px solid #ddd',
          }}
        >
          {column}
        </div>
      ))}
    </div>
  </div>
);

const SelectedNodeComponent: React.FC<PineNodeProps> = ({ data }) => {
  const { order, table, schema, color, alias, columns } = data;
  const [expanded, setExpanded] = useState(true);
  const [showOptions, setShowOptions] = useState(false);

  return (
    <div>
      <TableNode
        showOptions={showOptions}
        setShowOptions={setShowOptions}
        expanded={expanded}
        setExpanded={setExpanded}
        order={order}
        table={table}
        schema={schema}
        color={color}
        alias={alias}
      />

      <Columns expanded={expanded} columns={columns} />
    </div>
  );
};

export default SelectedNodeComponent;
