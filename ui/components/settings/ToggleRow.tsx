import { Box, Switch, Typography } from '@mui/material';
import InfoHint from '../InfoHint';

type ToggleRowProps = {
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  // The description in a tooltip on the label, not a line under it, where
  // the label says enough on its own.
  descriptionInTooltip?: boolean;
  // A line under the row, between it and the next. Off inside a group that
  // has its own edges, like an expanded connection.
  divider?: boolean;
};

const ToggleRow = ({ label, description, checked, onChange, disabled, descriptionInTooltip, divider = true }: ToggleRowProps) => (
  <Box
    sx={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 2,
      py: 1.25,
      borderBottom: divider ? '1px solid var(--border-color)' : 'none',
      opacity: disabled ? 0.6 : 1,
    }}
  >
    {descriptionInTooltip ? (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
        <Typography variant="body2" sx={{ color: 'var(--text-color)', fontFamily: 'var(--canvas-font)' }}>
          {label}
        </Typography>
        <InfoHint text={description} />
      </Box>
    ) : (
      <Box>
        <Typography variant="body2" sx={{ color: 'var(--text-color)', fontFamily: 'var(--canvas-font)' }}>
          {label}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {description}
        </Typography>
      </Box>
    )}
    <Switch checked={checked} onChange={(_e, value) => onChange(value)} disabled={disabled} />
  </Box>
);

export default ToggleRow;
