import { Box, Switch, Tooltip, Typography } from '@mui/material';

type ToggleRowProps = {
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  // The description in a tooltip on the label, not a line under it, where
  // the label says enough on its own.
  descriptionInTooltip?: boolean;
};

const ToggleRow = ({ label, description, checked, onChange, disabled, descriptionInTooltip }: ToggleRowProps) => (
  <Box
    sx={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 2,
      py: 1.25,
      borderBottom: '1px solid var(--border-color)',
      opacity: disabled ? 0.6 : 1,
    }}
  >
    {descriptionInTooltip ? (
      <Tooltip title={description} placement="top-start">
        <Typography variant="body2" sx={{ color: 'var(--text-color)', fontFamily: 'var(--canvas-font)', cursor: 'help' }}>
          {label}
        </Typography>
      </Tooltip>
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
