import { Box, Divider } from '@mui/material';
import {
  MAX_SIDEBAR_SECOND_VIEW_HEIGHT,
  MIN_SIDEBAR_SECOND_VIEW_HEIGHT,
  MIN_SIDEBAR_WIDTH,
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
