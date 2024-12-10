import React, { useState } from 'react';
import { Handle, NodeProps, Position } from 'reactflow';
import { SelectedNodeData } from '../model';

type PineNodeProps = NodeProps<SelectedNodeData>;

const TableNode = ({
  order,
  table,
  schema,
  color,
  alias,
}: {
  order: number;
  table: string;
  schema: string;
  color?: string | null;
  alias: string;
}) => {
  return (
    <div
      style={{
        padding: '12px 10px 5px 10px',
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
      }}
    >
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
};

const SelectedColumns = ({ columns }: { columns: string[] }) => (
  <div
    style={{
      maxHeight: '500px',
      overflow: 'hidden',
    }}
  >
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '4px',
        justifyContent: 'center',
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

const CandidateColumns = ({ expanded, columns }: { expanded: boolean; columns: string[] }) => (
  <div
    style={{
      maxHeight: expanded ? '500px' : '0',
      overflow: 'hidden',
      width: '100%',
    }}
  >
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '4px',
        justifyContent: 'center',
        width: '100%',
      }}
    >
      {columns.map(column => (
        <div
          key={column}
          style={{
            fontSize: '8px',
            fontFamily: 'Courier, monospace',
            background: 'transparent',
            padding: '2px 6px',
            borderRadius: '8px',
            border: '1px solid #ccc',
            color: '#666',
          }}
        >
          {column}
        </div>
      ))}
    </div>
  </div>
);

const Columns = ({ columns, expanded }: { columns: string[]; expanded: boolean }) => {
  const selectedColumnsSet = new Set(columns);
  const candidateColumns = ['id', 'name', 'created_at', 'updated_at', 'tenant_id'].filter(
    col => !selectedColumnsSet.has(col),
  );

  return (
    <div
      style={{
        width: 100,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '8px',
      }}
    >
      <SelectedColumns columns={columns} />
      <CandidateColumns expanded={expanded} columns={candidateColumns} />
    </div>
  );
};

const SelectedNodeComponent: React.FC<PineNodeProps> = ({ data }) => {
  const { order, table, schema, color, alias, columns } = data;
  const [expanded, setExpanded] = useState(false);
  return (
    <div
      style={{ width: 150 }}
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
    >
      <TableNode order={order} table={table} schema={schema} color={color} alias={alias} />
      <Columns columns={columns} expanded={expanded} />
    </div>
  );
};

export default SelectedNodeComponent;
