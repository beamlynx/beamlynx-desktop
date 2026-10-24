import React from 'react';
import { Badge, Box, ButtonBase, Divider, Tooltip, Typography } from '@mui/material';
import {
  KeyboardDoubleArrowLeft,
  KeyboardDoubleArrowRight,
  Notifications,
  SmartToyOutlined,
  StorageOutlined,
  PaletteOutlined,
  TuneOutlined,
  PolicyOutlined,
  HubOutlined,
  InfoOutlined,
  AccountCircleOutlined,
} from '@mui/icons-material';
import type { SvgIconComponent } from '@mui/icons-material';
import type { SettingsSection } from '../store/global.store';
import { observer } from 'mobx-react-lite';
import { useStores } from '../store/store-container';
import { isDesktop } from '../store/util';
import type { Investigation } from '../store/investigations';
import { DESKTOP_ONLY_SECTIONS, RAIL_ITEMS } from './settings/SettingsPanelContent';
import ActiveConnection from './ActiveConnection';

/**
 * The sidebar on the left, like Slack's: icons only by default, with labels
 * and the agent's investigations once expanded. Settings' sections are
 * items of their own, each with its icon: one opens Settings at that
 * section, beside the sidebar. One column of navigation, with no Settings
 * heading in between. It holds what used to sit in
 * the header's right corner -- the agent, what's new, and settings -- so they
 * open on the same side as what they show: the settings panel and an
 * investigation's timeline both open on the left.
 *
 * The agent's robot sits at the bottom, from the agent's first
 * investigation on. It pulses while the agent works and carries a count of
 * the decisions it is waiting on. Clicking it opens what most needs you, or else
 * the current investigation (GlobalStore.focusAgentTab). Expanded, each
 * investigation is listed by its question.
 */

// Each settings section's icon: the item's only mark when collapsed.
const SECTION_ICONS: Record<SettingsSection, SvgIconComponent> = {
  connections: StorageOutlined,
  theme: PaletteOutlined,
  preferences: TuneOutlined,
  'access-policy': PolicyOutlined,
  mcp: HubOutlined,
  account: AccountCircleOutlined,
  about: InfoOutlined,
};

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
  const waiting = investigation.pendingDecisions.length;
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
  const expanded = global.sideRailExpanded;
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
        : 'Connect an agent';
  // One item for agents: with no investigation yet it opens the setup, and
  // after that the agent's work, which links to the setup again.
  const setupOpen = global.showSettings && global.settingsSection === 'mcp';
  const openAgents = () => {
    if (global.investigations.length > 0) global.focusAgentTab();
    else global.setShowSettings(!setupOpen, setupOpen ? undefined : 'mcp');
  };

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
        pt: 1,
        pb: 0.5,
        px: 0.5,
        mr: 1,
        borderRight: '1px solid var(--border-color)',
        transition: 'width var(--motion-fast) var(--motion-ease-enter)',
        overflow: 'hidden',
      }}
    >
      {/* The active tab's database connection, at the top like a
          workspace in Slack: click it to switch. */}
      <ActiveConnection expanded={expanded} />
      <Divider sx={{ my: 0.5, borderColor: 'var(--border-color)' }} />

      {/* Settings' sections, each an item of its own: one opens Settings at
          that section, and the open one closes it again. */}
      {RAIL_ITEMS.map(item => {
        const open = global.showSettings && item.id === global.settingsSection;
        const desktopOnly = DESKTOP_ONLY_SECTIONS.includes(item.id) && !isDesktop();
        const Icon = SECTION_ICONS[item.id];
        return (
          <RailItem
            key={item.id}
            icon={<Icon sx={{ fontSize: 20, opacity: desktopOnly ? 0.55 : 1 }} />}
            label={desktopOnly ? `${item.label} (desktop)` : item.label}
            ariaLabel={open ? `Close ${item.label}` : item.label}
            tooltip={desktopOnly ? `${item.label} (desktop app only)` : item.label}
            expanded={expanded}
            active={open}
            onClick={() => (open ? global.setShowSettings(false) : global.setShowSettings(true, item.id))}
          />
        );
      })}

      <Box sx={{ flex: 1 }} />

      {/* The agent, at the bottom: before any investigation it opens the
          setup for connecting one, and afterwards the agent's work. */}
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
            active={(onAgentTab && !expanded) || setupOpen}
            onClick={openAgents}
          />
          {expanded &&
            global.investigations.map(investigation => (
              <InvestigationItem key={investigation.id} investigation={investigation} />
            ))}
        </>
      )}


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
      {/* Collapse or expand: a double chevron pointing the way the sidebar
          will move, unlike any other icon here. The menu icon it replaces
          looked like Database Connections' storage icon at this size. At the
          bottom, out of the way: the top is for the connection. */}
      <RailItem
        icon={
          expanded ? (
            <KeyboardDoubleArrowLeft sx={{ fontSize: 20 }} />
          ) : (
            <KeyboardDoubleArrowRight sx={{ fontSize: 20 }} />
          )
        }
        label="Collapse sidebar"
        ariaLabel={expanded ? 'Collapse the sidebar' : 'Expand the sidebar'}
        tooltip="Expand sidebar"
        expanded={expanded}
        onClick={() => global.setSideRailExpanded(!expanded)}
      />

    </Box>
  );
});

export default SideRail;
