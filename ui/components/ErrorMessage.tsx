import { Box, Typography } from '@mui/material';
import { observer } from 'mobx-react-lite';
import { useStores } from '../store/store-container';

interface ErrorMessageProps {
  sessionId: string;
}

/**
 * The band above Results, shown when the last build or run failed.
 *
 * It shows the whole message. It used to be cut to the first 120
 * characters (40 on a narrow window), with the rest reachable only by
 * hovering for a tooltip - and a database error puts the useful part last:
 * Postgres's DETAIL, HINT and the position of the offending token all come
 * after the one-line summary that was all that survived. A long message
 * scrolls inside a capped band instead, so it can never push the results
 * grid down the page.
 *
 * A parse error is the one message shown without the 🚨: it comes back
 * with a caret line pointing at the offending character, and a prefix
 * would shift the text out from under it.
 */
const ErrorMessage = observer(({ sessionId }: ErrorMessageProps) => {
  const { global } = useStores();
  const session = global.getSession(sessionId);

  if (!session.error) {
    return null;
  }

  const isParseError = session.errorType === 'parse';

  // Padding, not margin. The band's height is measured from this subtree
  // (CollapsibleHeight -> useCollapseHeight), and a margin here collapses
  // out of that measurement -- so the band was sized 16px shorter than the
  // content it clips, and the bottom of the message disappeared behind the
  // results grid. Padding is inside the measured box.
  return (
    <Box sx={{ padding: 1 }}>
      <Typography
        variant="caption"
        sx={{
          display: 'block',
          fontFamily: 'var(--code-font)',
          // Preserves the server's own line breaks and the runs of spaces a
          // parse error's caret line is made of.
          whiteSpace: 'break-spaces',
          // A long identifier or a quoted value with no spaces in it has
          // nowhere to break otherwise, and would run off the side.
          overflowWrap: 'anywhere',
          lineHeight: 1.4,
          // Six lines (8.4/1.4) before it scrolls, in `em` so the cap
          // follows the Text Size preference the way the text does -- but
          // never more than 40% of the results pane, whose height the
          // person controls by dragging the divider. Six lines of a short
          // pane is the whole pane, and the grid underneath would be
          // squeezed down to its footer. `cqh` resolves against RightPane
          // in NewLayoutView.tsx, which declares itself a size container
          // for this.
          maxHeight: 'min(8.4em, 40cqh)',
          overflowY: 'auto',
          // A visible scrollbar once there is more than fits: six lines of
          // a longer message look exactly like the whole of a six-line one
          // otherwise, which is the confusion this change is about. Same
          // tokens as JsonInspectorPanel.tsx/CommandPalette.tsx, not a new
          // style invented here.
          '&::-webkit-scrollbar': {
            width: '8px',
          },
          '&::-webkit-scrollbar-track': {
            background: 'transparent',
          },
          '&::-webkit-scrollbar-thumb': {
            background: 'var(--border-color)',
            borderRadius: '4px',
          },
          '&::-webkit-scrollbar-thumb:hover': {
            background: 'var(--text-color)',
          },
          color: 'error.main',
        }}
      >
        {isParseError ? session.error : `🚨 ${session.error}`}
      </Typography>
    </Box>
  );
});

export default ErrorMessage;
