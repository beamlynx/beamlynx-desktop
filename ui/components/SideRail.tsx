import React from 'react';
import { Badge, Box, ButtonBase, Tooltip, Typography } from '@mui/material';
import {
  MenuOpen,
  Menu as MenuIcon,
  Notifications,
  Settings,
  SmartToyOutlined,
} from '@mui/icons-material';
import { observer } from 'mobx-react-lite';
import { useStores } from '../store/store-container';
import { isDesktop } from '../store/util';
import type { Investigation } from '../store/investigations';
import { DESKTOP_ONLY_SECTIONS, RAIL_ITEMS } from './settings/SettingsPanelContent';

/**
 * The sidebar on the left, like Slack's: icons only by default, with labels
 * and the agent's investigations once expanded. While Settings is open, its
 * sections are listed here under Settings, and the sidebar shows its labels
 * for as long as it stays open: one column of navigation, with the open
 * section beside it. It holds what used to sit in
 * the header's right corner -- the agent, what's new, and settings -- so they
 * open on the same side as what they show: the settings panel and an
 * investigation's timeline both open on the left.
 *
 * The agent's robot pulses while it works and carries a count of the
 * decisions it is waiting on. Clicking it opens what most needs you, or else
 * the current investigation (GlobalStore.focusAgentTab). Expanded, each
 * investigation is listed by its question.
 */

const COLLAPSED = 48;
const EXPANDED = 232;

// The pulse while the agent works: the robot breathes rather than spins, so
// it reads as "busy" without pulling the eye the way a spinner does.
const pulse = {
  animation: 'pine-agent-pulse 1.4s ease-in-out infinite',
  '@keyframes pine-agent-pulse': {
    '0%, 100%': { opacity: 1 },
    '50%': { opacity: 0.35 },
  },
};

type RailItemProps = {
  icon: React.ReactNode;
  label: string;
  expanded: boolean;
  active?: boolean;
  onClick: () => void;
  ariaLabel?: string;
  tooltip?: string;
};

const RailItem = ({ icon, label, expanded, active, onClick, ariaLabel, tooltip }: RailItemProps) => {
  const button = (
    <ButtonBase
      onClick={onClick}
      aria-label={ariaLabel ?? label}
      sx={{
        width: '100%',
        height: 36,
        justifyContent: expanded ? 'flex-start' : 'center',
        gap: 1.25,
        px: expanded ? 1.25 : 0,
        borderRadius: 1,
        color: active ? 'var(--text-color)' : 'var(--canvas-text-dim)',
        backgroundColor: active ? 'var(--node-column-bg)' : 'transparent',
        '&:hover': { backgroundColor: 'var(--node-column-bg)', color: 'var(--text-color)' },
      }}
    >
      <Box sx={{ display: 'flex', flexShrink: 0 }}>{icon}</Box>
      {expanded && (
        <Typography noWrap sx={{ fontSize: 13, fontFamily: 'var(--canvas-font)' }}>
          {label}
        </Typography>
      )}
    </ButtonBase>
  );
  // Collapsed, the label is only a tooltip away.
  return expanded ? button : (
    <Tooltip title={tooltip ?? label} placement="right">
      {button}
    </Tooltip>
  );
};

const InvestigationItem = observer(({ investigation }: { investigation: Investigation }) => {
  const { global } = useStores();
  const active = global.activeSessionId === investigation.sessionId;
  const waiting = investigation.pendingApprovals.length;
  return (
    <ButtonBase
      onClick={() => global.openInvestigationTab(investigation)}
      sx={{
        width: '100%',
        justifyContent: 'flex-start',
        gap: 1,
        pl: 4.5,
        pr: 1.25,
        py: 0.5,
        borderRadius: 1,
        color: active ? 'var(--text-color)' : 'var(--canvas-text-dim)',
        backgroundColor: active ? 'var(--node-column-bg)' : 'transparent',
        '&:hover': { backgroundColor: 'var(--node-column-bg)', color: 'var(--text-color)' },
      }}
    >
      <Typography noWrap sx={{ flex: 1, minWidth: 0, textAlign: 'left', fontSize: 13 }}>
        {investigation.question ?? 'Agent investigation'}
      </Typography>
      {waiting > 0 && (
        <Box
          sx={{
            flexShrink: 0,
            minWidth: 16,
            height: 16,
            px: 0.5,
            borderRadius: 8,
            fontSize: 10,
            fontWeight: 600,
            lineHeight: '16px',
            textAlign: 'center',
            backgroundColor: 'var(--notification-color)',
            color: 'var(--background-color)',
          }}
          aria-label={`${waiting} waiting for your answer`}
        >
          {waiting}
        </Box>
      )}
    </ButtonBase>
  );
});

const SideRail = observer(({ hasUnreadUpdates, onOpenChangelog }: { hasUnreadUpdates: boolean; onOpenChangelog: () => void }) => {
  const { global } = useStores();
  // Settings' sections need their names, so the sidebar shows them while
  // Settings is open, then goes back to however the user left it.
  const expanded = global.sideRailExpanded || global.showSettings;
  const activity = global.agentActivity;
  const waiting = global.agentDecisionsWaiting;
  const working = activity.working;
  const agentHighlight = waiting > 0 || global.mcpHasUnseenActivity;
  const onAgentTab = global.agentSessionIds.includes(global.activeSessionId);
  const agentStatus = working
    ? `Agent: ${activity.current?.summary ?? 'working'}`
    : waiting > 0
      ? `Agent: waiting for your answer`
      : global.investigations.length > 0
        ? 'Open the agent’s investigation'
        : 'Agent: nothing yet. An agent that uses beamlynx shows up here.';

  return (
    <Box
      component="nav"
      aria-label="Sidebar"
      sx={{
        width: expanded ? EXPANDED : COLLAPSED,
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: 0.5,
        py: 0.5,
        px: 0.5,
        mr: 1,
        borderRight: '1px solid var(--border-color)',
        transition: 'width var(--motion-fast) var(--motion-ease-enter)',
        overflow: 'hidden',
      }}
    >
      <RailItem
        icon={expanded ? <MenuOpen sx={{ fontSize: 20 }} /> : <MenuIcon sx={{ fontSize: 20 }} />}
        label="Collapse"
        ariaLabel={expanded ? 'Collapse the sidebar' : 'Expand the sidebar'}
        tooltip="Expand"
        expanded={expanded}
        onClick={() => global.setSideRailExpanded(!expanded)}
      />

      {isDesktop() && (
        <>
          <RailItem
            icon={
              <Badge
                badgeContent={waiting}
                sx={{
                  // The badge's text in the background colour inverts cleanly
                  // against each theme's notification amber.
                  '& .MuiBadge-badge': {
                    backgroundColor: 'var(--notification-color)',
                    color: 'var(--background-color)',
                    fontSize: '0.625rem',
                    fontWeight: 600,
                    height: 16,
                    minWidth: 16,
                  },
                }}
              >
                <SmartToyOutlined
                  sx={{
                    fontSize: 20,
                    color: working
                      ? 'var(--canvas-trace)'
                      : agentHighlight
                        ? 'var(--notification-color)'
                        : 'inherit',
                    ...(working ? pulse : {}),
                  }}
                />
              </Badge>
            }
            label="Agent"
            ariaLabel={waiting > 0 ? `Agent (${waiting} waiting for your answer)` : 'Agent'}
            tooltip={agentStatus}
            expanded={expanded}
            active={onAgentTab && !expanded}
            onClick={() => global.focusAgentTab()}
          />
          {expanded &&
            (global.investigations.length > 0 ? (
              global.investigations.map(investigation => (
                <InvestigationItem key={investigation.id} investigation={investigation} />
              ))
            ) : (
              <Typography sx={{ pl: 4.5, pr: 1, fontSize: 12, color: 'var(--canvas-text-dim)', lineHeight: 1.4 }}>
                When an agent uses beamlynx, its investigation shows here.
              </Typography>
            ))}
        </>
      )}

      <Box sx={{ flex: 1 }} />

      <RailItem
        icon={
          <Notifications
            sx={{ fontSize: 20, color: hasUnreadUpdates ? 'var(--notification-color)' : 'inherit' }}
          />
        }
        label="What’s new"
        ariaLabel={hasUnreadUpdates ? "What's new (unread updates)" : "What's new"}
        expanded={expanded}
        onClick={onOpenChangelog}
      />
      <RailItem
        icon={<Settings sx={{ fontSize: 20 }} />}
        label="Settings"
        ariaLabel={global.showSettings ? 'Close settings' : 'Settings'}
        expanded={expanded}
        active={global.showSettings && !expanded}
        onClick={() => global.setShowSettings(!global.showSettings)}
      />
      {global.showSettings &&
        RAIL_ITEMS.map(item => {
          const active = item.id === global.settingsSection;
          const desktopOnly = DESKTOP_ONLY_SECTIONS.includes(item.id) && !isDesktop();
          return (
            <ButtonBase
              key={item.id}
              onClick={() => global.setSettingsSection(item.id)}
              aria-current={active ? 'page' : undefined}
              sx={{
                width: '100%',
                justifyContent: 'space-between',
                pl: 4.5,
                pr: 1.25,
                py: 0.5,
                borderRadius: 1,
                fontSize: 13,
                fontFamily: 'var(--canvas-font)',
                color: active ? 'var(--text-color)' : 'var(--canvas-text-dim)',
                backgroundColor: active ? 'var(--node-column-bg)' : 'transparent',
                opacity: desktopOnly ? 0.55 : 1,
                '&:hover': { backgroundColor: 'var(--node-column-bg)', color: 'var(--text-color)' },
              }}
            >
              <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {item.label}
              </Box>
              {desktopOnly && (
                <Box component="span" sx={{ fontSize: 10.4, opacity: 0.7 }}>
                  desktop
                </Box>
              )}
            </ButtonBase>
          );
        })}
    </Box>
  );
});

export default SideRail;
