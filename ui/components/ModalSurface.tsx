import { Box, Grow, Modal, SxProps, Theme } from '@mui/material';
import { ReactElement, ReactNode } from 'react';

interface ModalSurfaceProps {
  open: boolean;
  onClose: () => void;
  /**
   * Where the dialog sits in the viewport. 'top' is for the command
   * palette, which is anchored near the top edge rather than centred; it
   * also moves the scale's origin there, so the palette grows downward out
   * of the search box instead of outward from its own middle.
   */
  align?: 'center' | 'top';
  /** Styling for the dialog surface itself - width, height, padding. */
  surfaceSx?: SxProps<Theme>;
  /** Styling for the backdrop layer. */
  sx?: SxProps<Theme>;
  slotProps?: React.ComponentProps<typeof Modal>['slotProps'];
  /** Key handling for the dialog itself, e.g. the command palette's arrow keys. */
  onKeyDown?: React.KeyboardEventHandler<HTMLDivElement>;
  children: ReactNode;
  'aria-labelledby'?: string;
  'aria-describedby'?: string;
}

/**
 * The one dialog shell every modal in the app renders through.
 *
 * MUI's `Modal` animates its BACKDROP and nothing else - the dialog itself
 * has no transition unless you hand it a transition child. None of the six
 * modals here did, so they all popped into place fully formed, which is the
 * single most noticeable "this was not designed" moment in the app. Rather
 * than making that call six times, they share this.
 *
 * Centring is done by flexbox on the backdrop, NOT by the
 * `position: absolute; top: 50%; left: 50%; transform: translate(-50%,-50%)`
 * these modals each used to carry. That is not a tidy-up: `Grow` animates
 * by setting `transform: scale(...)` inline on this very element, which
 * would overwrite the centring translate and fling the dialog into the
 * bottom-right quadrant for the length of every open. Flex centring leaves
 * the transform free for the animation to use. (It also drops the
 * half-pixel text blur `translate(-50%, ...)` causes on odd-width dialogs.)
 *
 * Durations come from the theme, which styles/theme.ts feeds from
 * styles/motion.ts - including collapsing them to zero when the OS asks for
 * reduced motion, which MUI's inline-style transitions would otherwise
 * ignore entirely.
 */
const ModalSurface = ({
  open,
  onClose,
  align = 'center',
  surfaceSx,
  sx,
  slotProps,
  onKeyDown,
  children,
  ...ariaProps
}: ModalSurfaceProps): ReactElement => (
  <Modal
    open={open}
    onClose={onClose}
    // Without this the dialog is unmounted the instant `open` goes false
    // and the closing animation never runs.
    closeAfterTransition
    slotProps={slotProps}
    sx={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: align === 'top' ? 'flex-start' : 'center',
      ...sx,
    }}
    {...ariaProps}
  >
    <Grow in={open} style={{ transformOrigin: align === 'top' ? 'top center' : 'center' }}>
      <Box
        onKeyDown={onKeyDown}
        sx={{
          bgcolor: 'var(--background-color)',
          border: '1px solid var(--border-color)',
          boxShadow: 24,
          borderRadius: 2,
          outline: 'none',
          ...surfaceSx,
        }}
      >
        {children}
      </Box>
    </Grow>
  </Modal>
);

export default ModalSurface;
