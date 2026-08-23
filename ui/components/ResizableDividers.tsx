import { Box, Divider } from '@mui/material';
import {
  MAX_SIDEBAR_SECOND_VIEW_HEIGHT,
  MIN_NEW_LAYOUT_PANE_SIZE,
  MIN_NEW_LAYOUT_PANEL_SIZE,
  MIN_SIDEBAR_SECOND_VIEW_HEIGHT,
  MIN_SIDEBAR_WIDTH,
  NEW_LAYOUT_GUTTER,
} from '../constants';
import { useResizeDrag } from '../hooks/useResizeDrag';
import { STORAGE_KEYS } from '../store/preferences';

export const ResizableHorizontalDivider = ({
  secondViewHeight,
  setSecondViewHeight,
}: {
  secondViewHeight: number;
  setSecondViewHeight: (height: number) => void;
}) => {
  const onMouseDown = useResizeDrag({
    value: secondViewHeight,
    setValue: setSecondViewHeight,
    min: MIN_SIDEBAR_SECOND_VIEW_HEIGHT,
    max: MAX_SIDEBAR_SECOND_VIEW_HEIGHT,
    storageKey: STORAGE_KEYS.SIDEBAR_SECOND_VIEW_HEIGHT,
    axis: 'y',
  });

  return (
    <Divider
      orientation="horizontal"
      sx={{
        height: '10px',
        flexShrink: 0,
        cursor: 'row-resize',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        opacity: 0,
        '&:hover': {
          backgroundColor: 'action.hover',
          transition: 'background-color 0.2s',
          opacity: 1,
        },
      }}
      onMouseDown={onMouseDown}
    >
      <Box
        sx={{
          width: '24px',
          height: '4px',
          backgroundColor: 'var(--divider-color)',
          borderRadius: '2px',
        }}
      />
    </Divider>
  );
};

export const ResizableDivider = ({
  sidebarWidth,
  setSidebarWidth,
}: {
  sidebarWidth: number;
  setSidebarWidth: (width: number) => void;
}) => {
  const onMouseDown = useResizeDrag({
    value: sidebarWidth,
    setValue: setSidebarWidth,
    min: MIN_SIDEBAR_WIDTH,
    max: () => window.innerWidth * 0.5,
    storageKey: STORAGE_KEYS.SIDEBAR_WIDTH,
    axis: 'x',
  });

  return (
    <Divider
      orientation="vertical"
      sx={{
        position: 'absolute',
        right: 0,
        top: 0,
        bottom: 0,
        cursor: 'col-resize',
        width: '10px',
        opacity: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        '&:hover': {
          backgroundColor: 'action.hover',
          transition: 'background-color 0.2s',
          opacity: 1,
        },
      }}
      onMouseDown={onMouseDown}
    >
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '8px',
        }}
      >
        <Box
          sx={{
            width: '4px',
            height: '24px',
            backgroundColor: 'var(--divider-color)',
            borderRadius: '2px',
          }}
        />
      </Box>
    </Divider>
  );
};

/**
 * New Layout's own dividers - separate from the two above since Legacy's
 * hardcode Legacy's own storage keys/bounds/positioning (the vertical one is
 * absolute-positioned to overlay a fixed-width sidebar; New Layout's panes
 * are plain flex siblings, so this one sits inline instead).
 */
export const NewLayoutPaneDivider = ({
  paneWidth,
  setPaneWidth,
}: {
  paneWidth: number;
  setPaneWidth: (width: number) => void;
}) => {
  const onMouseDown = useResizeDrag({
    value: paneWidth,
    setValue: setPaneWidth,
    min: MIN_NEW_LAYOUT_PANE_SIZE,
    max: () => window.innerWidth * 0.75,
    storageKey: STORAGE_KEYS.NEW_LAYOUT_PANE_WIDTH,
    axis: 'x',
  });

  return (
    <Divider
      orientation="vertical"
      flexItem
      sx={{
        width: `${NEW_LAYOUT_GUTTER}px`,
        flexShrink: 0,
        cursor: 'col-resize',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        opacity: 0,
        '&:hover': {
          backgroundColor: 'action.hover',
          transition: 'background-color 0.2s',
          opacity: 1,
        },
      }}
      onMouseDown={onMouseDown}
    >
      <Box
        sx={{
          width: '4px',
          height: '24px',
          backgroundColor: 'var(--divider-color)',
          borderRadius: '2px',
        }}
      />
    </Divider>
  );
};

export const NewLayoutHorizontalPaneDivider = ({
  paneHeight,
  setPaneHeight,
}: {
  paneHeight: number;
  setPaneHeight: (height: number) => void;
}) => {
  const onMouseDown = useResizeDrag({
    value: paneHeight,
    setValue: setPaneHeight,
    min: MIN_NEW_LAYOUT_PANE_SIZE,
    max: () => window.innerHeight * 0.75,
    storageKey: STORAGE_KEYS.NEW_LAYOUT_PANE_HEIGHT,
    axis: 'y',
  });

  return (
    <Divider
      orientation="horizontal"
      sx={{
        height: `${NEW_LAYOUT_GUTTER}px`,
        flexShrink: 0,
        cursor: 'row-resize',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        opacity: 0,
        '&:hover': {
          backgroundColor: 'action.hover',
          transition: 'background-color 0.2s',
          opacity: 1,
        },
      }}
      onMouseDown={onMouseDown}
    >
      <Box
        sx={{
          width: '24px',
          height: '4px',
          backgroundColor: 'var(--divider-color)',
          borderRadius: '2px',
        }}
      />
    </Divider>
  );
};

/**
 * The Pine/SQL panel's own resize dividers - separate from the two pane
 * dividers above, which govern the Canvas|Results split. Same duplication
 * trade-off as that pair (own storage key, own bounds) rather than threading
 * conditional props through one shared component.
 */
export const NewLayoutPanelDivider = ({
  panelWidth,
  setPanelWidth,
}: {
  panelWidth: number;
  setPanelWidth: (width: number) => void;
}) => {
  const onMouseDown = useResizeDrag({
    value: panelWidth,
    setValue: setPanelWidth,
    min: MIN_NEW_LAYOUT_PANEL_SIZE,
    max: () => window.innerWidth * 0.6,
    storageKey: STORAGE_KEYS.NEW_LAYOUT_PANEL_WIDTH,
    axis: 'x',
  });

  return (
    <Divider
      orientation="vertical"
      flexItem
      sx={{
        width: '10px',
        flexShrink: 0,
        cursor: 'col-resize',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        opacity: 0,
        '&:hover': {
          backgroundColor: 'action.hover',
          transition: 'background-color 0.2s',
          opacity: 1,
        },
      }}
      onMouseDown={onMouseDown}
    >
      <Box
        sx={{
          width: '4px',
          height: '24px',
          backgroundColor: 'var(--divider-color)',
          borderRadius: '2px',
        }}
      />
    </Divider>
  );
};

export const NewLayoutHorizontalPanelDivider = ({
  panelHeight,
  setPanelHeight,
}: {
  panelHeight: number;
  setPanelHeight: (height: number) => void;
}) => {
  const onMouseDown = useResizeDrag({
    value: panelHeight,
    setValue: setPanelHeight,
    min: MIN_NEW_LAYOUT_PANEL_SIZE,
    max: () => window.innerHeight * 0.6,
    storageKey: STORAGE_KEYS.NEW_LAYOUT_PANEL_HEIGHT,
    axis: 'y',
  });

  return (
    <Divider
      orientation="horizontal"
      sx={{
        height: '10px',
        flexShrink: 0,
        cursor: 'row-resize',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        opacity: 0,
        '&:hover': {
          backgroundColor: 'action.hover',
          transition: 'background-color 0.2s',
          opacity: 1,
        },
      }}
      onMouseDown={onMouseDown}
    >
      <Box
        sx={{
          width: '24px',
          height: '4px',
          backgroundColor: 'var(--divider-color)',
          borderRadius: '2px',
        }}
      />
    </Divider>
  );
};
