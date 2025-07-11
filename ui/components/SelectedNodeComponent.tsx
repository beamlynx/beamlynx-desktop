import React, { useEffect, useState } from 'react';
import { Handle, NodeProps, Position } from 'reactflow';
import { SelectedNodeData } from '../model';
import { Session } from '../store/session';
import { useStores } from '../store/store-container';
type PineNodeProps = NodeProps<SelectedNodeData>;

const onSelectedNodeClick = (session: Session, alias: string) => {
  session.setContext(alias);
};

const onCandidateColumnClick = (session: Session, column: string, type: 'select' | 'order' | 'where') => {
  if (type === 'select') {
    session.appendAndUpdateExpression(`${column}, `);
  } else if (type === 'order') {
    session.appendAndUpdateExpression(`${column} desc, `);
  } else {
    session.appendAndUpdateExpression(`${column} = `);
  }
};

const TableNode = ({
  order,
  table,
  schema,
  color,
  alias,
  sessionId,
}: {
  order: number;
  table: string;
  schema: string;
  color?: string | null;
  alias: string;
  sessionId: string;
}) => {
  const { global } = useStores();
  const session = global.getSession(sessionId);
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
        className="selected-node-inner"
        onClick={() => onSelectedNodeClick(session, alias)}
        style={{
          position: 'relative',
          padding: '12px 10px 5px 10px',
          border: '2px solid var(--node-border)',
          background: 'var(--node-bg)',
          borderRadius: '5px',
          cursor: 'pointer',
          color: 'var(--node-text-color)',
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
              color: 'var(--node-secondary-text-color)',
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
              background: 'var(--node-order-bg)',
              color: 'var(--node-order-text-color)',
              fontSize: '12px',
              boxShadow: '0 2px 4px rgba(0,0,0,0.25)',
              fontWeight: 'bold',
            }}
          >
            {order}
          </div>
        }

        {/* Schema */}
        {schema && schema !== 'public' && (
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
              background: color ?? 'var(--node-schema-bg)',
              color: color ? '#000000' : 'var(--node-schema-text-color)', // Use dark text on bright colors
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
            background: 'var(--node-handle-bg)',
            borderRadius: '50%',
          }}
        />
        <Handle
          type="source"
          position={Position.Right}
          style={{
            width: '2px',
            height: '2px',
            background: 'var(--node-handle-bg)',
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
      flex: 1,
    }}
  >
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '4px',
      }}
    >
      {columns.map(column => (
        <div
          key={column}
          style={{
            fontSize: '8px',
            fontFamily: 'Courier, monospace',
            background: 'var(--node-column-bg)',
            padding: '2px 6px',
            borderRadius: '8px',
            border: '1px solid var(--node-column-border)',
            color: 'var(--node-column-text-color)',
          }}
        >
          {column}
        </div>
      ))}
    </div>
  </div>
);

const CandidateColumns = ({
  columns,
  sessionId,
  type,
}: {
  columns: string[];
  sessionId: string;
  type: 'select' | 'order' | 'where';
}) => {
  const { global } = useStores();
  const session = global.getSession(sessionId);
  return (
    <div
      style={{
        maxHeight: columns.length > 0 ? '500px' : '0',
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
            onClick={() => onCandidateColumnClick(session, column, type)}
            style={{
              fontSize: '8px',
              fontFamily: 'Courier, monospace',
              background: 'transparent',
              padding: '2px 6px',
              borderRadius: '8px',
              border: '1px solid var(--node-candidate-column-border)',
              color: 'var(--node-candidate-column-text-color)',
              cursor: 'pointer',
            }}
          >
            {column}
          </div>
        ))}
      </div>
    </div>
  );
};

const Columns = ({
  columns,
  suggested,
  type,
  sessionId,
}: {
  columns: string[];
  suggested: string[];
  type: 'select' | 'order' | 'where';
  sessionId: string;
}) => {
  const selectedColumnsSet = new Set(columns.filter(Boolean));
  const candidateColumns = suggested.filter(col => !selectedColumnsSet.has(col));
  const showOperationName = selectedColumnsSet.size > 0 || candidateColumns.length > 0;

  return (
    <div
      style={{
        marginBottom: 5,
        width: 200,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {showOperationName && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span
            style={{
              fontFamily: 'Courier, monospace',
              fontSize: '8px',
              color: 'var(--node-operation-label-color)',
              whiteSpace: 'nowrap',
              // fontWeight: 'bold',
            }}
          >
            {`${type.padStart(8, '\u00A0')} :`}
          </span>
          {selectedColumnsSet.size > 0 && (
            <SelectedColumns columns={Array.from(selectedColumnsSet)} />
          )}
        </div>
      )}
      {candidateColumns.length > 0 && (
        <div
          style={{
            backgroundColor: 'transparent',
            padding: '12px',
            margin: '8px',
          }}
        >
          <CandidateColumns columns={candidateColumns} sessionId={sessionId} type={type} />
        </div>
      )}
    </div>
  );
};

const SelectedNodeComponent: React.FC<PineNodeProps> = ({ data }) => {
  const {
    order,
    table,
    schema,
    color,
    alias,
    columns: selectedColumns,
    orderColumns,
    whereColumns,
    suggestedColumns,
    suggestedOrderColumns,
    suggestedWhereColumns,
    sessionId,
  } = data;
  return (
    <div>
      <TableNode
        order={order}
        table={table}
        schema={schema}
        color={color}
        alias={alias}
        sessionId={sessionId}
      />
      <Columns
        columns={selectedColumns}
        suggested={suggestedColumns}
        type="select"
        sessionId={sessionId}
      />
      <Columns
        columns={orderColumns}
        suggested={suggestedOrderColumns}
        type="order"
        sessionId={sessionId}
      />
      <Columns
        columns={whereColumns}
        suggested={suggestedWhereColumns}
        type="where"
        sessionId={sessionId}
      />
    </div>
  );
};

export default SelectedNodeComponent;