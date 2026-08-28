import { Box, ButtonBase, Typography } from '@mui/material';
import { Check } from '@mui/icons-material';
import { observer } from 'mobx-react-lite';
import { useStores } from '../../store/store-container';
import { THEME_LIST, buildColorTokens } from '../../styles/palette/build';
import { ColorTokens, ThemeId } from '../../styles/palette/tokens';
import { UI_FONT_FAMILIES, CODE_FONT_FAMILIES } from '../../styles/app-font';
import { UI_FONTS, CODE_FONTS } from '../../styles/fonts';
import { TEXT_SIZE_LABELS, TextSize } from '../../styles/text-size';

const TEXT_SIZES: TextSize[] = ['small', 'medium', 'large'];

const SectionLabel = ({ children }: { children: string }) => (
  <Typography
    variant="caption"
    sx={{
      display: 'block',
      mt: 2.5,
      mb: 1,
      color: 'var(--canvas-text-dim)',
      fontFamily: 'var(--canvas-font)',
      letterSpacing: '0.05em',
    }}
  >
    {children.toUpperCase()}
  </Typography>
);

const SegmentedControl = <T extends string>({
  options,
  labels,
  value,
  onChange,
}: {
  options: T[];
  labels: Record<T, string>;
  value: T;
  onChange: (value: T) => void;
}) => (
  <Box sx={{ display: 'inline-flex', border: '1px solid var(--border-color)', borderRadius: 1.5, overflow: 'hidden' }}>
    {options.map(option => {
      const active = option === value;
      return (
        <ButtonBase
          key={option}
          onClick={() => onChange(option)}
          sx={{
            px: 3,
            py: 1,
            fontFamily: 'var(--canvas-font)',
            // Fixed px, not rem -- see SettingsModal.tsx's settingsTheme
            // comment.
            fontSize: '13.6px',
            color: active ? 'var(--primary-text-color)' : 'var(--text-color)',
            backgroundColor: active ? 'var(--primary-color)' : 'transparent',
            borderRight: '1px solid var(--border-color)',
            '&:last-of-type': { borderRight: 'none' },
          }}
        >
          {labels[option]}
        </ButtonBase>
      );
    })}
  </Box>
);

/**
 * Three complete, hand-tuned themes (styles/palette/themes.ts) - not a
 * light/dark toggle crossed with a swappable surface/accent, which read as
 * "every theme looks the same" (direct feedback). Picking a theme sets
 * light/dark/syntax-highlighting behavior too (GlobalStore.theme derives
 * from it), so there's no separate dark-mode switch here anymore.
 */
const ThemeSection = () => {
  const { global } = useStores();

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <Typography
        variant="h6"
        component="h2"
        sx={{
          flexShrink: 0,
          color: 'var(--text-color)',
          pb: 1.5,
          mb: 2,
          borderBottom: '1px solid var(--border-color)',
        }}
      >
        Appearance
      </Typography>

      <Box className="styled-scrollbar" sx={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        <SectionLabel>Theme</SectionLabel>
        <Box sx={{ border: '1px solid var(--border-color)', borderRadius: 1.5, overflow: 'hidden' }}>
          {THEME_LIST.map((themeOption, i) => {
            const preview = buildColorTokens(themeOption.id);
            const active = themeOption.id === global.themeId;
            return (
              <ThemeRow
                key={themeOption.id}
                id={themeOption.id}
                label={themeOption.label}
                description={themeOption.description}
                preview={preview}
                active={active}
                divider={i < THEME_LIST.length - 1}
                onSelect={() => (global.themeId = themeOption.id)}
              />
            );
          })}
        </Box>

        <SectionLabel>Interface font</SectionLabel>
        <Typography variant="caption" sx={{ display: 'block', mb: 1, color: 'var(--canvas-text-dim)' }}>
          Buttons, labels, and headers. System matches your OS and loads instantly.
        </Typography>
        <Box sx={{ border: '1px solid var(--border-color)', borderRadius: 1.5, overflow: 'hidden' }}>
          {UI_FONTS.map((font, i) => (
            <FontRow
              key={font.id}
              label={font.label}
              fontFamily={UI_FONT_FAMILIES[font.id].fontFamily}
              active={font.id === global.uiFontFamily}
              divider={i < UI_FONTS.length - 1}
              onSelect={() => (global.uiFontFamily = font.id)}
            />
          ))}
        </Box>

        <SectionLabel>Code font</SectionLabel>
        <Typography variant="caption" sx={{ display: 'block', mb: 1, color: 'var(--canvas-text-dim)' }}>
          The query editor and results grid, where monospace alignment matters.
        </Typography>
        <Box sx={{ border: '1px solid var(--border-color)', borderRadius: 1.5, overflow: 'hidden' }}>
          {CODE_FONTS.map((font, i) => (
            <FontRow
              key={font.id}
              label={font.label}
              fontFamily={CODE_FONT_FAMILIES[font.id].fontFamily}
              active={font.id === global.codeFontFamily}
              divider={i < CODE_FONTS.length - 1}
              onSelect={() => (global.codeFontFamily = font.id)}
            />
          ))}
        </Box>

        <SectionLabel>Text size</SectionLabel>
        <Typography variant="caption" sx={{ display: 'block', mb: 1, color: 'var(--canvas-text-dim)' }}>
          Scales text and spacing across the app, including the query editor and results grid.
          Resizable panels and the canvas keep their own size.
        </Typography>
        <SegmentedControl options={TEXT_SIZES} labels={TEXT_SIZE_LABELS} value={global.textSize} onChange={v => (global.textSize = v)} />
      </Box>
    </Box>
  );
};

type ThemeRowProps = {
  id: ThemeId;
  label: string;
  description: string;
  preview: ColorTokens;
  active: boolean;
  divider: boolean;
  onSelect: () => void;
};

const ThemeRow = ({ label, description, preview, active, divider, onSelect }: ThemeRowProps) => (
  <ButtonBase
    onClick={onSelect}
    sx={{
      width: '100%',
      display: 'flex',
      alignItems: 'center',
      gap: 1.5,
      px: 1.5,
      py: 1.25,
      justifyContent: 'flex-start',
      backgroundColor: active ? 'var(--canvas-chip-bg)' : 'transparent',
      borderLeft: active ? '2px solid var(--primary-color)' : '2px solid transparent',
      borderBottom: divider ? '1px solid var(--border-color)' : 'none',
    }}
  >
    <Box sx={{ display: 'flex', gap: 0.5, flexShrink: 0 }}>
      {/* A pale near-white bg chip reads as "blank" for the light themes, so
          the swatch leads with the schema tint (more saturated than the
          bare background) and ends with the raw accent color - the two
          tokens that actually carry each theme's identity at a glance. */}
      {(['--background-color', '--node-schema-bg', '--primary-color'] as const).map(key => (
        <Box
          key={key}
          sx={{
            width: 16,
            height: 16,
            borderRadius: 0.5,
            backgroundColor: preview[key],
            border: `1px solid ${preview['--border-color']}`,
          }}
        />
      ))}
    </Box>
    <Box sx={{ flex: 1, textAlign: 'left' }}>
      <Typography
        variant="body2"
        sx={{ color: 'var(--text-color)', fontFamily: 'var(--canvas-font)', display: 'flex', alignItems: 'center', gap: 0.5 }}
      >
        {label}
      </Typography>
      <Typography variant="caption" sx={{ color: 'var(--canvas-text-dim)' }}>
        {description}
      </Typography>
    </Box>
    {active && <Check sx={{ fontSize: 16, color: 'var(--primary-color)' }} />}
  </ButtonBase>
);

type FontRowProps = {
  label: string;
  fontFamily: string;
  active: boolean;
  divider: boolean;
  onSelect: () => void;
};

// Same convention Slack/Google Docs/VS Code's own font pickers use: the
// font's name is the preview, rendered live in itself - recognizable text
// rather than a symbol string (e.g. "Ag 0O1lI {}"), while still showing
// the font's actual letterforms since it's set in that real typeface.
const FontRow = ({ label, fontFamily, active, divider, onSelect }: FontRowProps) => (
  <ButtonBase
    onClick={onSelect}
    sx={{
      width: '100%',
      display: 'flex',
      alignItems: 'center',
      gap: 1.5,
      px: 1.5,
      py: 1.25,
      justifyContent: 'flex-start',
      backgroundColor: active ? 'var(--canvas-chip-bg)' : 'transparent',
      borderBottom: divider ? '1px solid var(--border-color)' : 'none',
    }}
  >
    <Typography variant="body1" sx={{ color: 'var(--text-color)', fontFamily, flex: 1, textAlign: 'left' }}>
      {label}
    </Typography>
    {active && <Check sx={{ fontSize: 16, color: 'var(--primary-color)' }} />}
  </ButtonBase>
);

export default observer(ThemeSection);
