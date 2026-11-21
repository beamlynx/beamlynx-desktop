import { createSvgIcon } from '@mui/material';

/**
 * A database: an outlined cylinder, drawn in the weight of Material's
 * outlined icons, which have no database of their own. Used for Database
 * Connections in the sidebar, where StorageOutlined read as a server rack.
 */
const DatabaseOutlined = createSvgIcon(
  <g fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
    <ellipse cx="12" cy="5.5" rx="7" ry="2.5" />
    <path d="M5 5.5v13c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5v-13" />
    <path d="M5 12c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5" />
  </g>,
  'DatabaseOutlined',
);

export default DatabaseOutlined;
