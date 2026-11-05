import type { SettingsSection } from '../../store/global.store';

// Settings' sections, in their own module so the sidebar and the keyboard
// can list them without loading Settings itself (SettingsPanelContent,
// which loads when Settings is first shown).

// Exported so useSettingsKeybindings.ts can drive j/k rail navigation off
// the exact same order shown here, rather than a second, hand-kept list.
export const RAIL_ITEMS: { id: SettingsSection; label: string }[] = [
  // "Database" is deliberate, not filler -- a future "connection to the pine
  // server itself" concept will also use the word "connection", so this
  // stays unambiguous about which kind it means from the rail alone.
  { id: 'connections', label: 'Database Connections' },
  { id: 'theme', label: 'Appearance' },
  { id: 'preferences', label: 'Preferences' },
  // No 'mcp' item: the Agent page opens from the sidebar's Agent item
  // (SideRail.tsx), where agents' work shows too. It holds connecting an
  // agent, the databases it can use, and their data masking: masking only
  // matters once an agent is involved, so it has no item of its own.
  { id: 'account', label: 'Account' },
  { id: 'about', label: 'About' },
];

// 'mcp' and 'account' only exist in the desktop app.
// Exported for the same reason RAIL_ITEMS is -- useSettingsKeybindings.ts's
// j/k rail navigation skips these in browser mode too, off this exact list,
// not a second hand-kept one.
export const DESKTOP_ONLY_SECTIONS: SettingsSection[] = ['mcp', 'account'];
