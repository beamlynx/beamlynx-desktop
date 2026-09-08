import React from 'react';
import { parseJsonCellValue } from './json-cell.util';

interface JsonCellContentProps {
  value: unknown;
  onOpen: () => void;
}

/**
 * renderCell for a column detected as JSON (see columnLooksLikeJson) - a
 * single-line truncated preview, click to open the value, already editable,
 * in Result.tsx's JsonInspectorPanel (a docked side panel, not a popover
 * anchored to this cell - that approach went through two rounds of hover/
 * pin/popover positioning bugs before landing here; a panel has no anchor
 * to go stale and no per-cell width to jitter). `title` is the hint: a
 * native tooltip needs no positioning code of its own and can't misbehave
 * the way a custom one did.
 *
 * No double-click-to-edit here, and this column is `editable: false` at
 * the DataGrid level (see Result.tsx) - this click IS the edit gesture
 * (opening the panel already in edit mode, not a separate Edit button one
 * click away - that extra step was its own complaint), not a second one
 * layered on top of it. A previous round had a click-to-view panel AND a
 * double-click-to-edit inline grid editor AND a separate Inspect modal, and
 * that three-surface split was the actual complaint, not any one surface's
 * own behavior.
 */
const JsonCellContent: React.FC<JsonCellContentProps> = ({ value, onOpen }) => {
  const parsed = parseJsonCellValue(value);

  if (parsed === undefined) {
    return (
      <div
        style={{
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          width: '100%',
        }}
      >
        {value === null || value === undefined ? '' : String(value)}
      </div>
    );
  }

  return (
    <div
      onClick={onOpen}
      title="Click to edit"
      style={{
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        width: '100%',
        cursor: 'pointer',
      }}
    >
      {JSON.stringify(parsed)}
    </div>
  );
};

export default JsonCellContent;
