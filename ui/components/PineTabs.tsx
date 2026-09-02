import * as React from 'react';
import Box from '@mui/material/Box';
import Tab from '@mui/material/Tab';
import TabContext from '@mui/lab/TabContext';
import TabList from '@mui/lab/TabList';
import TabPanel from '@mui/lab/TabPanel';
import Session from './Session';
import { observer } from 'mobx-react-lite';
import { runInAction } from 'mobx';
import { useStores } from '../store/store-container';
import { AddCircle, CloseOutlined } from '@mui/icons-material';
import { IconButton, CircularProgress, Tooltip } from '@mui/material';
import { NEW_LAYOUT_GUTTER, VERTICAL_TAB_RAIL_WIDTH } from '../constants';

/* Drag auto-scroll for the vertical rail: how far from either end the pointer
 * has to get before the rail starts scrolling, and the top speed once it's
 * pressed right up against that end. The speed is per animation frame, so
 * ~14px at 60fps is a brisk but still followable ~840px/s -- fast enough to
 * cross a long rail without waiting, slow enough to release on the tab you
 * meant. Local to the rail's drag gesture, so they live here rather than in
 * constants.ts with the layout sizing. */
const RAIL_AUTOSCROLL_EDGE = 48;
const RAIL_AUTOSCROLL_MAX_SPEED = 14;

const PineTabs = observer(() => {
  const { global } = useStores();

  // Derive tabs directly from global sessions
  const tabs = Object.keys(global.sessions).map(sessionId => ({ sessionId }));
  const sessionId = global.activeSessionId;
  const activeSession = global.sessions[sessionId];
  const activeConnectionId = activeSession?.connectionId || '';
  const activeIndicatorColor =
    global.getConnectionColor(activeConnectionId) || 'var(--canvas-node-border)';

  // Appearance -> Tabs. Everything below reads this one flag rather than
  // branching into two copies of the tab strip: the two orientations differ
  // only in which axis they run along and which edge carries the divider,
  // so a second component would be the same markup with a handful of style
  // words swapped -- and the kind of thing where a fix lands in one copy.
  const vertical = global.tabOrientation === 'vertical';

  // How the strip meets the session content beside/above it: its divider and
  // its insets. Three self-contained cases rather than a shared base plus
  // overrides -- they disagree on the divider, on the insets, AND on the
  // units those insets are expressed in, so a common base would be mostly
  // declarations one case immediately undoes.
  //
  // The insets exist because a vertical rail sits BESIDE the content instead
  // of above it, so it has to adopt whatever top/bottom inset that content
  // gives itself; without them it runs the full height of AppView's tab row
  // and overhangs the graph panel at both ends.
  const stripFrame = !vertical
    ? {
        // Stacked above the content: one full-width rule, and the content's
        // own top margin is already the gap between the two.
        borderBottom: '1px solid var(--border-color)',
        alignItems: 'center',
        mt: 0,
      }
    : global.layoutMode === 'new'
      ? {
          // Beside the content in New Layout, where every pane -- Canvas,
          // Results, docked Settings -- reads as a bordered card with the
          // gutter between it and its neighbour. A bare right divider here
          // instead put the rail's hard square edge flush against Canvas's
          // own rounded border, reading as one doubled seam (reported
          // directly). Same token and radius as NewLayoutView's pane
          // wrapper, so the rail is a sibling card rather than the one bit
          // of chrome that opted out. Literal px for the gutter, matching
          // `my: NEW_LAYOUT_GUTTER` on that same wrapper.
          border: '1px solid var(--border-color)',
          borderRadius: 1,
          overflow: 'hidden',
          mt: `${NEW_LAYOUT_GUTTER}px`,
          mb: `${NEW_LAYOUT_GUTTER}px`,
          mr: `${NEW_LAYOUT_GUTTER}px`,
        }
      : {
          // Legacy has no card convention to match -- its sidebar sits flush
          // and unbordered -- so a plain divider is the consistent choice
          // there, not the odd one out. `mt: 1` mirrors LegacySessionView's
          // own Grid: MUI theme spacing, which Text Size scales, so a
          // hardcoded 8px would drift from it at Small and Large. Legacy
          // gives itself no bottom inset, so neither does this.
          borderRight: '1px solid var(--border-color)',
          mt: 1,
        };

  const setActiveTab = (newSessionId: string) => {
    runInAction(() => {
      global.activeSessionId = newSessionId;
    });
  };

  const handleChange = (event: React.SyntheticEvent, newSessionId: string) => {
    setActiveTab(newSessionId);
  };

  const addTab = () => {
    global.addTab();
  };

  const removeTab = (sessionIdToRemove: string) => {
    global.closeTab(sessionIdToRemove);
  };

  // Which tab is currently being dragged, or null. Local state, not store
  // state: it lasts exactly as long as one gesture and nothing outside this
  // component has any use for it.
  const [draggedId, setDraggedId] = React.useState<string | null>(null);

  // Only the rail scrolls -- the horizontal strip is variant="standard",
  // which shrinks tabs to fit rather than overflowing -- so everything below
  // is vertical-only. The scroller is MUI's own element inside TabList
  // (`overflowY: auto` once the Tabs are scrollable + vertical), looked up on
  // demand rather than held in a ref, since it comes and goes with the
  // orientation.
  const railRef = React.useRef<HTMLDivElement | null>(null);
  const getRailScroller = () =>
    railRef.current?.querySelector<HTMLElement>('.MuiTabs-scroller') ?? null;

  const autoScroll = React.useRef<{ frame: number | null; velocity: number }>({
    frame: null,
    velocity: 0,
  });

  const stopAutoScroll = React.useCallback(() => {
    if (autoScroll.current.frame !== null) cancelAnimationFrame(autoScroll.current.frame);
    autoScroll.current.frame = null;
    autoScroll.current.velocity = 0;
  }, []);

  // Driven by its own frame loop rather than by the dragover events that feed
  // it: dragover stops firing the instant the pointer stops moving, and
  // holding still against the end of the rail is exactly what you do while
  // waiting for it to scroll. Event-driven, it would step once and stall.
  const runAutoScroll = React.useCallback(() => {
    const scroller = getRailScroller();
    if (!scroller || autoScroll.current.velocity === 0) {
      stopAutoScroll();
      return;
    }
    scroller.scrollTop += autoScroll.current.velocity;
    autoScroll.current.frame = requestAnimationFrame(runAutoScroll);
    // getRailScroller reads a ref, so it never goes stale -- no dep needed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stopAutoScroll]);

  const updateAutoScroll = (clientY: number) => {
    const scroller = getRailScroller();
    if (!scroller) return;
    const { top, bottom } = scroller.getBoundingClientRect();

    // Ramped by how deep into the edge zone the pointer is, so the rail
    // creeps as you enter it and only runs at full speed pinned to the very
    // end -- a flat speed makes the last few tabs impossible to stop on.
    // Clamped at 1 so dragging past the rail entirely doesn't accelerate
    // without limit.
    const ramp = (depth: number) => Math.min(depth / RAIL_AUTOSCROLL_EDGE, 1);
    let velocity = 0;
    if (clientY < top + RAIL_AUTOSCROLL_EDGE) {
      velocity = -RAIL_AUTOSCROLL_MAX_SPEED * ramp(top + RAIL_AUTOSCROLL_EDGE - clientY);
    } else if (clientY > bottom - RAIL_AUTOSCROLL_EDGE) {
      velocity = RAIL_AUTOSCROLL_MAX_SPEED * ramp(clientY - (bottom - RAIL_AUTOSCROLL_EDGE));
    }

    autoScroll.current.velocity = velocity;
    if (velocity === 0) {
      stopAutoScroll();
    } else if (autoScroll.current.frame === null) {
      autoScroll.current.frame = requestAnimationFrame(runAutoScroll);
    }
  };

  // A drag that ends while the loop is running (or an orientation switch, or
  // a closed tab) would otherwise leave a frame loop scrolling a detached
  // element forever.
  React.useEffect(() => stopAutoScroll, [stopAutoScroll]);

  // Reorder live, as the pointer crosses each tab, rather than drawing an
  // insertion line and applying it on drop. The strip rearranging under the
  // pointer IS the preview -- it shows the actual result instead of a
  // promise of it, and it's what a real browser's tab strip does, so it
  // needs no explanation. The flip side is that the move is committed as it
  // happens: dropping outside the strip keeps the last arrangement rather
  // than snapping back, same as Chrome.
  const handleDragOver = (event: React.DragEvent<HTMLElement>, overId: string) => {
    if (!draggedId) return;
    // Both required, and required on EVERY dragover -- without them the drop
    // is rejected and the cursor shows "not allowed" over the strip.
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    if (overId === draggedId) return;

    const ids = Object.keys(global.sessions);
    const from = ids.indexOf(draggedId);
    const overIndex = ids.indexOf(overId);
    if (from < 0 || overIndex < 0) return;

    // Only swap once the pointer is past the middle of the tab it's over, so
    // a tab that is merely wider than its neighbour can't ping-pong the two
    // the moment its edge is touched. The axis to measure is the one the
    // strip runs along.
    const rect = event.currentTarget.getBoundingClientRect();
    const pastMidpoint = vertical
      ? event.clientY > rect.top + rect.height / 2
      : event.clientX > rect.left + rect.width / 2;

    // Insertion point in the strip as it looks right now; pulling the dragged
    // tab out first shifts everything after it down one, so account for that
    // before comparing.
    let to = pastMidpoint ? overIndex + 1 : overIndex;
    if (from < to) to -= 1;
    if (to === from) return;

    global.moveTab(from, to);
  };

  return (
    <Box
      sx={{
        width: '100%',
        mt: 0,
        pt: 0,
        flex: 1,
        minHeight: 0,
        display: 'flex',
        // The strip and the panels are siblings either way -- laying this
        // box out as a row is the whole of "put the tabs down the side".
        flexDirection: vertical ? 'row' : 'column',
      }}
    >
      <TabContext value={sessionId}>
        {/* Hidden in Zen mode -- the tab strip is exactly the kind of "app
            chrome" a graph-only view is meant to hide; the TabPanels below
            (the actual session content) stay mounted either way. */}
        {!global.isZenModeActive && (
          <Box
            ref={railRef}
            // On the rail as a whole, not on each Tab: dragover from the tabs
            // bubbles up here anyway, and this additionally covers the gaps
            // between them and the header, so the scroll doesn't cut out
            // wherever the pointer happens to be between two tabs.
            // preventDefault makes the whole rail a valid drop target, which
            // is what stops the "not allowed" cursor appearing over those
            // same gaps.
            onDragOver={
              vertical && draggedId
                ? (event: React.DragEvent<HTMLElement>) => {
                    event.preventDefault();
                    updateAutoScroll(event.clientY);
                  }
                : undefined
            }
            onDragLeave={
              vertical
                ? (event: React.DragEvent<HTMLElement>) => {
                    // dragleave bubbles, so it also fires every time the
                    // pointer crosses between the rail's own children. Only
                    // treat it as leaving when where it went is genuinely
                    // outside the rail.
                    const next = event.relatedTarget as Node | null;
                    if (next && railRef.current?.contains(next)) return;
                    stopAutoScroll();
                  }
                : undefined
            }
            sx={{
              backgroundColor: 'var(--canvas-node-bg)',
              display: 'flex',
              flexShrink: 0,
              ...(vertical
                ? {
                    flexDirection: 'column',
                    // Fixed width, so a long session name has to be allowed
                    // to ellipsize rather than widen the rail (see the Tab
                    // label's own minWidth: 0 below, which is what actually
                    // lets it).
                    width: VERTICAL_TAB_RAIL_WIDTH,
                    minWidth: 0,
                  }
                : {}),
              // Last, so nothing below can quietly win over its margins --
              // the strip's pre-existing `mt: 0` sat after this spread at
              // one point and silently overrode the rail's top inset.
              ...stripFrame,
            }}
          >
            {/* The rail puts "new tab" at the TOP, above the list, which is
                where every vertical-tab UI people already use (Arc,
                Firefox's vertical tabs) puts it -- and where the eye starts
                on a left-hand rail. The bottom, where this began, is the
                one spot that drifts further from the "+" the longer the
                list gets.

                Icon-only in its own header row, with the name carried by
                the tooltip: a written "New tab" label was the widest,
                highest-contrast text in the rail, which is backwards for a
                secondary control sitting above the tab names that actually
                matter. Right-aligned so it lands in the same column as the
                tab rows' own close buttons (same 16px inset, same
                IconButton size, so the right edges line up) -- the rail's
                controls read as one column instead of two scattered ones.
                flexShrink: 0 keeps the header pinned while the list scrolls
                under it. */}
            {vertical && (
              <Box
                sx={{
                  flexShrink: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'flex-end',
                  // Literal px, matching MUI's own hardcoded `12px 16px` Tab
                  // padding (which theme.spacing's Text Size scaling doesn't
                  // touch) -- anything scaled would drift out of the close
                  // buttons' column at Small and Large.
                  px: '16px',
                  // Slightly tighter than a tab row's 40: this is a header
                  // holding one control, not another list item, and the rail
                  // is better spent on tabs.
                  minHeight: 36,
                  borderBottom: '1px solid var(--border-color)',
                }}
              >
                <Tooltip title="New tab" placement="right">
                  <IconButton
                    onClick={addTab}
                    size="small"
                    tabIndex={-1} // Prevent tab focus, like every control in this strip
                    sx={{
                      color: 'var(--canvas-trace)',
                      '&:hover': {
                        color: 'var(--canvas-node-border-current)',
                        backgroundColor: 'var(--canvas-chip-bg)',
                      },
                    }}
                  >
                    {/* Larger than the 14px close glyphs it shares a column
                        with -- adding a tab is the primary action here, and
                        the two shouldn't read as equals. */}
                    <AddCircle sx={{ fontSize: 18 }} />
                  </IconButton>
                </Tooltip>
              </Box>
            )}

            <TabList
              onChange={handleChange}
              orientation={vertical ? 'vertical' : 'horizontal'}
              // Only the rail scrolls. The horizontal strip keeps MUI's
              // default 'standard' variant it has always used -- switching
              // it too would change how existing tabs size themselves,
              // which this setting has no business doing.
              variant={vertical ? 'scrollable' : 'standard'}
              sx={{
                // Take the rail's remaining height, so the header above
                // stays pinned and only the list scrolls under it.
                ...(vertical
                  ? {
                      flex: 1,
                      minHeight: 0,
                      // Anchor for the scroll buttons below.
                      position: 'relative',
                      // MUI lays its scroll buttons out as flex children:
                      // `height: 40, flexShrink: 0` each in vertical, and when
                      // they aren't needed it only takes them to `opacity: 0`
                      // -- they keep their box. That is 80px of a rail that
                      // exists to list tabs, permanently spent on two controls
                      // that are usually invisible. Floating them over the
                      // scroller instead costs the list nothing, and they only
                      // ever appear when there is something off-screen to
                      // scroll to. Disabled ButtonBase already sets
                      // pointer-events: none, so while hidden they don't
                      // swallow clicks on the tab underneath.
                      '& .MuiTabs-scrollButtons': {
                        position: 'absolute',
                        left: 0,
                        right: 0,
                        zIndex: 1,
                        // Shorter than MUI's 40 as well: it's an overlay now,
                        // so its height is how much of a real tab it covers.
                        height: 24,
                        minHeight: 24,
                        color: 'var(--canvas-text-dim)',
                        // Not a flat transparent: the arrow would sit directly
                        // on top of a half-scrolled tab name and neither would
                        // be readable. Fading out of the rail's own background
                        // keeps it legible while still reading as "floating
                        // over the list" rather than as a bar with a box.
                        background:
                          'linear-gradient(to bottom, var(--canvas-node-bg) 40%, transparent)',
                        '&:hover': { color: 'var(--canvas-text)' },
                        // Start button renders first, end button last (see
                        // MUI's Tabs render order); they're the only <button>
                        // children, the scroller between them being a div.
                        '&:first-of-type': { top: 0 },
                        '&:last-of-type': {
                          bottom: 0,
                          background:
                            'linear-gradient(to top, var(--canvas-node-bg) 40%, transparent)',
                        },
                      },
                    }
                  : {}),
                // A close button on every tab at all times is six competing
                // "delete" targets in a row (see the horizontal strip with a
                // few tabs open) -- so reveal each tab's own on hover of that
                // tab. Opacity rather than display/visibility toggling: the
                // button keeps its box either way, so tabs don't resize and
                // the row doesn't reflow as the pointer crosses it, and in
                // the rail the name's ellipsis boundary stays put. Applies to
                // the active tab too -- it has no more claim to a permanent
                // delete button than any other, and exempting it would put a
                // lone X in the strip that reads as the only closable tab.
                '& .pine-tab-close': {
                  opacity: 0,
                  pointerEvents: 'none',
                  transition: 'opacity 120ms ease',
                },
                '& .MuiTab-root:hover .pine-tab-close': {
                  opacity: 1,
                  pointerEvents: 'auto',
                },
                // Without a pointer there is no hover to reveal anything,
                // and closing a tab would be reachable only via the command
                // palette -- so on touch the buttons simply stay visible.
                '@media (hover: none)': {
                  '& .pine-tab-close': { opacity: 1, pointerEvents: 'auto' },
                },
                '& .MuiTab-root': {
                  color: 'var(--canvas-text-dim)',
                  fontFamily: 'var(--canvas-font)',
                  minHeight: 40,
                  // Matches the close button's own fade, so the whole tab
                  // resolves as one gesture rather than a background snap
                  // with an icon easing in behind it.
                  transition: 'background-color 120ms ease, color 120ms ease',
                  ...(vertical
                    ? {
                        // MUI centers tab labels and caps them at 360px;
                        // in a rail they should read as a left-aligned list
                        // filling its full width, like a file tree.
                        alignItems: 'flex-start',
                        textAlign: 'left',
                        maxWidth: 'none',
                        minWidth: 0,
                      }
                    : {}),
                  // Stage one: the tab lifts one surface step (--canvas-node-bg
                  // -> --canvas-chip-bg) and its label goes from dim to full
                  // text colour, so "which tab am I on" is answered by the
                  // whole row rather than by the close button appearing --
                  // which is both a very small target to read as feedback and
                  // the wrong thing to draw the eye to first. One step, not a
                  // dramatic one: this fires constantly as the pointer crosses
                  // the strip, so it has to stay quiet enough to ignore.
                  '&:hover': {
                    backgroundColor: 'var(--canvas-chip-bg)',
                    color: 'var(--canvas-text)',
                  },
                  // MUST stay after '&:hover'. Both compile to two-class
                  // selectors (.css-x:hover and .css-x.Mui-selected), so
                  // specificity ties and source order is what decides.
                  // Ahead of it, hovering the active tab would drop its accent
                  // colour to plain text -- reading as a deselection every
                  // time the pointer passed over it.
                  '&.Mui-selected': {
                    color: 'var(--canvas-trace)',
                  },
                },
                '& .MuiTabs-indicator': {
                  backgroundColor: activeIndicatorColor,
                },
              }}
            >
              {tabs.map((tab, index) => {
                const session = global.getSession(tab.sessionId);
                const sessionConnectionId = session.connectionId || '';
                const connectionColor = global.getConnectionColor(sessionConnectionId);
                const isLive = global.isConnectionLive(sessionConnectionId);
                return (
                  <Tab
                    key={tab.sessionId}
                    tabIndex={-1} // Prevent tab focus
                    draggable
                    onDragStart={(event: React.DragEvent<HTMLElement>) => {
                      setDraggedId(tab.sessionId);
                      event.dataTransfer.effectAllowed = 'move';
                      // Firefox refuses to start a drag at all unless the
                      // dataTransfer carries something, even though the drop
                      // is handled entirely in React state and never reads
                      // this back.
                      event.dataTransfer.setData('text/plain', tab.sessionId);
                    }}
                    onDragOver={(event: React.DragEvent<HTMLElement>) =>
                      handleDragOver(event, tab.sessionId)
                    }
                    onDrop={(event: React.DragEvent<HTMLElement>) => {
                      // The reordering already happened on dragover; this
                      // just stops the browser treating the payload above as
                      // a page navigation.
                      event.preventDefault();
                      setDraggedId(null);
                      stopAutoScroll();
                    }}
                    // Fires however the gesture ends -- dropped on the strip,
                    // dropped outside it, or cancelled with Escape -- so it,
                    // not onDrop, is what guarantees the state is cleared.
                    onDragEnd={() => {
                      setDraggedId(null);
                      stopAutoScroll();
                    }}
                    sx={{
                      // The tab being carried, dimmed so the gap it leaves is
                      // legible as "this is the one moving". Not hidden
                      // outright: it stays the drop target under the pointer,
                      // and a strip that resizes mid-drag is much harder to
                      // aim.
                      opacity: draggedId === tab.sessionId ? 0.4 : 1,
                    }}
                    label={
                      <span
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          // Fills the rail so the close button lands on its
                          // right edge instead of hugging the name.
                          ...(vertical ? { width: '100%', minWidth: 0 } : {}),
                        }}
                      >
                        {sessionConnectionId && (
                          <span
                            title={isLive ? undefined : 'Assigned but not connected yet'}
                            style={{
                              width: 6,
                              height: 6,
                              borderRadius: '50%',
                              backgroundColor: isLive ? connectionColor : 'transparent',
                              border: isLive
                                ? 'none'
                                : `1.5px solid ${connectionColor || 'var(--canvas-node-border)'}`,
                              boxSizing: 'border-box',
                              display: 'inline-block',
                              flexShrink: 0,
                            }}
                          />
                        )}
                        {(session.loading || session.connecting) && (
                          <CircularProgress size={12} sx={{ color: 'inherit' }} />
                        )}
                        {/* Truncation is vertical-only: the rail has a fixed
                            width a long name has to give way to, whereas the
                            horizontal strip has always let MUI size and wrap
                            the label itself, and this setting has no business
                            changing that. minWidth: 0 is what actually permits
                            the ellipsis -- a flex item's default
                            min-width: auto would otherwise let the name push
                            the rail's fixed width open instead of truncating. */}
                        <span
                          style={
                            vertical
                              ? {
                                  flex: 1,
                                  minWidth: 0,
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                }
                              : undefined
                          }
                        >
                          {global.getSessionName(tab.sessionId)}
                        </span>
                        <IconButton
                          className="pine-tab-close"
                          style={{ marginLeft: '5px' }}
                          size="small"
                          component="span"
                          tabIndex={-1} // Prevent tab focus
                          onClick={(event: React.MouseEvent<HTMLButtonElement>) => {
                            event.stopPropagation();
                            removeTab(tab.sessionId);
                          }}
                          sx={{
                            flexShrink: 0,
                            color: 'var(--canvas-text-dim)',
                            // Stage two: hovering the X itself. Its background
                            // has to be --canvas-node-border, not the
                            // --canvas-chip-bg it used to be -- that is now
                            // the hovered tab's OWN background, so the button
                            // would have been picking out a chip in exactly
                            // the colour it was sitting on and stage two would
                            // have been invisible. Deliberately neutral rather
                            // than --canvas-warn red: this fires on the way to
                            // clicking anywhere near the button, and reserving
                            // red for actual errors keeps it meaningful.
                            '&:hover': {
                              color: 'var(--canvas-text)',
                              backgroundColor: 'var(--canvas-node-border)',
                            },
                          }}
                        >
                          <CloseOutlined sx={{ fontSize: '14px' }} tabIndex={-1} />
                        </IconButton>
                      </span>
                    }
                    value={tab.sessionId}
                  />
                );
              })}
            </TabList>

            {/* Button to add new tab. Horizontal only -- the rail has its
                own, in the header above the list. Same MUI Tooltip as that
                one, rather than SvgIcon's `titleAccess`: the two "+" buttons
                should behave identically on hover, and MUI's SvgIcon has no
                `title` prop at all (only `titleAccess`, which renders a
                native in-SVG tooltip that looks nothing like the rest of the
                app's). */}
            {!vertical && (
              <Tooltip title="New tab">
                <AddCircle
                  sx={{
                    ml: 2,
                    cursor: 'pointer',
                    color: 'var(--canvas-trace)',
                    '&:hover': {
                      color: 'var(--canvas-node-border-current)',
                    },
                  }}
                  onClick={addTab}
                />
              </Tooltip>
            )}
          </Box>
        )}

        {tabs.map(tab => (
          <TabPanel
            key={tab.sessionId}
            // The flex/display overrides only apply to the ACTIVE tab's
            // panel. MUI's TabPanel keeps one <div hidden> per inactive tab
            // in the DOM too (only its children are unmounted) - giving
            // every one of those `display: 'flex'` as well would override
            // the native [hidden] attribute's display:none (an sx-generated
            // class beats the UA stylesheet's attribute selector), making
            // every inactive tab's empty panel participate in this flex row
            // instead of being invisible and out of layout.
            //
            // minWidth: 0 matters only in the vertical case, where the panel
            // is a flex item along the horizontal axis and would otherwise
            // refuse to shrink below its content's intrinsic width, pushing
            // the rail off-screen -- harmless in the horizontal case, where
            // the panel's width isn't flex-derived at all.
            sx={
              tab.sessionId === sessionId
                ? {
                    padding: 0,
                    flex: 1,
                    minHeight: 0,
                    minWidth: 0,
                    display: 'flex',
                    flexDirection: 'column',
                  }
                : { padding: 0 }
            }
            value={tab.sessionId}
          >
            <Session sessionId={tab.sessionId}></Session>
          </TabPanel>
        ))}
      </TabContext>
    </Box>
  );
});

export default PineTabs;
