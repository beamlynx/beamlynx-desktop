import InfoOutlined from '@mui/icons-material/InfoOutlined';
import { Tooltip } from '@mui/material';
import type { ReactNode } from 'react';

/**
 * A small, dim info icon that explains something on hover, placed right
 * after what it explains. The explanation stays out of the way until
 * wanted, and the icon says there is one to read. Focusable, so the
 * keyboard can reach it too.
 */
const InfoHint = ({ text }: { text: ReactNode }) => (
  <Tooltip title={text} placement="top-start">
    <InfoOutlined
      tabIndex={0}
      aria-label={typeof text === 'string' ? text : 'More about this'}
      sx={{
        fontSize: 15,
        color: 'var(--canvas-text-dim)',
        opacity: 0.7,
        flexShrink: 0,
        outline: 'none',
        '&:hover, &:focus-visible': { opacity: 1, color: 'var(--text-color)' },
      }}
    />
  </Tooltip>
);

export default InfoHint;
