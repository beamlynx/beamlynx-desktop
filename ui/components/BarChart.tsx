import { Box, Typography, Tooltip } from '@mui/material';
import React, { useState } from 'react';

interface BarChartProps {
  data: Array<{ label: string; value: number }>;
  height?: string;
}

export const BarChart: React.FC<BarChartProps> = ({ data, height = '400px' }) => {
  const [hoveredBar, setHoveredBar] = useState<number | null>(null);
  
  if (!data || data.length === 0) {
    return (
      <Box sx={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Typography variant="body2" color="gray">
          No data to display
        </Typography>
      </Box>
    );
  }

  const maxValue = Math.max(...data.map(item => item.value));
  const minValue = Math.min(...data.map(item => item.value));
  const valueRange = maxValue - minValue;
  
  // Handle case where all values are the same
  const yAxisMax = valueRange === 0 ? maxValue + Math.abs(maxValue * 0.1) + 1 : maxValue + valueRange * 0.1;
  const yAxisMin = minValue < 0 ? minValue - valueRange * 0.1 : 0;
  const yAxisRange = yAxisMax - yAxisMin;
  const yAxisTicks = 10;

  return (
    <Box sx={{ width: '100%', height: '500px' }}>
      <Box
        sx={{
          borderRadius: 1,
          height: '100%',
          padding: 2,
          border: '1px solid var(--border-color)',
          display: 'flex',
          backgroundColor: 'var(--background-color)',
        }}
      >
        {/* Y-axis */}
        <Box
          sx={{
            width: '60px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            borderRight: '1px solid var(--border-color)',
            paddingRight: 1,
            height: 'calc(100% - 100px)',
            marginTop: 0,
          }}
        >
          {Array.from({ length: yAxisTicks + 1 }).map((_, index) => {
            const tickValue = yAxisTicks - index;
            const value = yAxisMin + (yAxisRange * tickValue) / yAxisTicks;
            const displayValue = Math.round(value);
            return (
              <Typography
                key={index}
                variant="caption"
                sx={{
                  transform: 'translateY(50%)',
                  textAlign: 'right',
                  width: '100%',
                  color: 'var(--text-color)',
                }}
              >
                {displayValue}
              </Typography>
            );
          })}
        </Box>

        {/* Chart area */}
        <Box
          sx={{
            flex: 1,
            height: 'calc(100% - 100px)',
            marginLeft: 2,
            position: 'relative',
            marginTop: 0,
          }}
        >
          {/* Bar chart */}
          <svg
            width="100%"
            height="100%"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            style={{ position: 'absolute', top: 0, left: 0 }}
          >
            {data.map((item, index) => {
              // Calculate normalized values for SVG coordinate system
              const barHeightNorm = ((item.value - yAxisMin) / yAxisRange) * 100;
              const barWidth = (100 / data.length) * 0.8; // 80% of available space
              const barX = (index / data.length) * 100 + ((100 / data.length) - barWidth) / 2;
              const barY = 100 - barHeightNorm;
              const isHovered = hoveredBar === index;

              return (
                <Tooltip
                  key={index}
                  title={
                    <Box sx={{ textAlign: 'center' }}>
                      <Typography variant="caption" sx={{ fontWeight: 'bold' }}>
                        {item.label}
                      </Typography>
                      <br />
                      <Typography variant="body2">
                        {item.value.toLocaleString()}
                      </Typography>
                    </Box>
                  }
                  arrow
                  placement="top"
                >
                  <rect
                    x={barX}
                    y={barY}
                    width={barWidth}
                    height={barHeightNorm}
                    fill={isHovered ? '#6b6fe8' : '#8884d8'}
                    stroke={isHovered ? '#6b6fe8' : '#8884d8'}
                    strokeWidth="0.1"
                    style={{ cursor: 'pointer', transition: 'fill 0.2s' }}
                    onMouseEnter={() => setHoveredBar(index)}
                    onMouseLeave={() => setHoveredBar(null)}
                  />
                </Tooltip>
              );
            })}
          </svg>

          {/* X-axis labels */}
          <Box
            sx={{
              position: 'absolute',
              bottom: -80,
              left: 0,
              right: 0,
              display: 'flex',
              justifyContent: 'space-between',
            }}
          >
            {data.map((item, index) => {
              const labelXPercent = (index / data.length) * 100 + (100 / data.length) / 2;
              return (
                <Typography
                  key={index}
                  variant="caption"
                  sx={{
                    position: 'absolute',
                    left: `${labelXPercent}%`,
                    transform: 'translateX(-50%) rotate(-90deg)',
                    transformOrigin: 'top center',
                    color: 'var(--text-color)',
                    fontSize: '0.7rem',
                    whiteSpace: 'nowrap',
                    maxWidth: '120px',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                  title={item.label}
                >
                  {item.label}
                </Typography>
              );
            })}
          </Box>
        </Box>
      </Box>
    </Box>
  );
};

