import { Box, SxProps, Theme } from '@mui/material';
import { ReactNode } from 'react';
import { useCollapseHeight } from '../hooks/useCollapseHeight';

interface CollapsibleHeightProps {
  /** Open when true, collapsed to nothing when false. */
  expanded: boolean;
  /**
   * Styling for the content inside the clip - an opacity or transform to
   * ride along with the height, typically.
   */
  contentSx?: SxProps<Theme>;
  /** Overrides the default enter/exit transition on the wrapper. */
  transition?: string;
  children: ReactNode;
}

/**
 * Collapses whatever it wraps to nothing, and back, on a measured height.
 *
 * A component rather than a bare `useCollapseHeight` call at each site, and
 * that distinction is the whole point: the measurement is React STATE, so
 * whoever holds it re-renders every time it changes. Held in AppView -- as
 * this was at first -- that meant re-rendering AppView's entire subtree,
 * which is PineTabs, every open Session, NewLayoutView and Canvas. During a
 * panel animation that happens several times, and it was measurably most of
 * the jitter: a synthetic width animation on the same page, with no React
 * behind it, holds a perfect 17ms frame while the real one dropped 5 frames
 * in 17.
 *
 * Owning the state down here contains it. When the height changes, only
 * this component re-renders; `children` arrive as an unchanged prop, so
 * React skips the subtree entirely.
 *
 * The content keeps its natural size throughout and is clipped, rather than
 * being squeezed - otherwise text would rewrap its whole way down.
 */
const CollapsibleHeight = ({
  expanded,
  contentSx,
  transition,
  children,
}: CollapsibleHeightProps) => {
  const { contentRef, height } = useCollapseHeight<HTMLDivElement>(expanded);

  return (
    <Box
      data-panel-motion
      sx={{
        flexShrink: 0,
        overflow: 'hidden',
        height,
        transition:
          transition ??
          (expanded
            ? 'height var(--motion-enter) var(--motion-ease-enter)'
            : 'height var(--motion-exit) var(--motion-ease-exit)'),
      }}
    >
      <Box ref={contentRef} sx={contentSx}>
        {children}
      </Box>
    </Box>
  );
};

export default CollapsibleHeight;
