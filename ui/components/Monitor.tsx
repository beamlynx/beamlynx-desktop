import { Box, Typography } from '@mui/material';
import { observer } from 'mobx-react-lite';
import { useStores } from '../store/store-container';
import { useEffect } from 'react';
import { TOTAL_BARS } from '../constants';

export const Monitor = observer(({ sessionId, height }: { sessionId: string, height: string }) => {
  const { global } = useStores();
  const session = global.getSession(sessionId);
  const data = session.connectionCountLogs;
  const maxCount = Math.max(...data.map((item: { count: number }) => item.count)) + 10;
  const yAxisTicks = 10;

  // Set up the interval when monitoring is active
  useEffect(() => {
    let intervalId: NodeJS.Timeout | undefined;

    if (session.mode === 'monitor' && document.visibilityState === 'visible') {
      intervalId = setInterval(() => {
        session.updateConnectionLogs();
      }, 1000);

      // Set up visibility change listener
      const handleVisibilityChange = () => {
        if (document.visibilityState === 'hidden') {
          if (!intervalId) return;
          clearInterval(intervalId);
          intervalId = undefined;
          return;
        }

        if (document.visibilityState !== 'visible') return;
        if (session.mode !== 'monitor') return;

        intervalId = setInterval(() => {
          session.updateConnectionLogs();
        }, 1000);
      };

      document.addEventListener('visibilitychange', handleVisibilityChange);

      return () => {
        if (intervalId) {
          clearInterval(intervalId);
        }
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      };
    }

    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [session, session.mode]);

  return (
    <Box sx={{ flex: 1, height }}>
      <Box
        sx={{
          borderRadius: 1,
          height: '100%',
          padding: 2,
          border: '1px solid lightgray',
          display: 'flex',
        }}
      >
        {/* Y-axis */}
        <Box
          sx={{
            width: '40px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            borderRight: '1px solid lightgray',
            paddingRight: 1,
            height: 'calc(100% - 30px)',
            marginTop: 0,
          }}
        >
          {Array.from({ length: yAxisTicks + 1 }).map((_, index) => {
            const tickValue = yAxisTicks - index;
            const value = Math.round((maxCount * tickValue) / yAxisTicks);
            const displayValue = isNaN(value) || !isFinite(value) ? tickValue : value;
            return (
              <Typography
                key={index}
                variant="caption"
                sx={{
                  transform: 'translateY(50%)',
                  textAlign: 'right',
                  width: '100%',
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
            height: 'calc(100% - 30px)',
            marginLeft: 2,
            position: 'relative',
            marginTop: 0,
          }}
        >
          {/* Line chart */}
          <svg
            width="100%"
            height="100%"
            viewBox={`0 0 ${TOTAL_BARS} 100`}
            preserveAspectRatio="none"
            style={{ position: 'absolute', top: 0, left: 0 }}
          >
            <path
              d={`M ${data
                .map((item, index) => {
                  const x = index;
                  const y = ((maxCount - item.count) / maxCount) * 100;
                  return `${x} ${y}`;
                })
                .join(' L ')}`}
              fill="none"
              stroke="#8884d8"
              strokeWidth="2"
              vectorEffect="non-scaling-stroke"
            />
          </svg>

          {/* Time labels */}
          <Box
            sx={{
              position: 'absolute',
              bottom: -14,
              left: 0,
              right: 0,
              display: 'flex',
              justifyContent: 'space-between',
            }}
          >
            {data.map(
              (item, index) =>
                index % 10 === 0 && (
                  <Typography
                    key={index}
                    variant="caption"
                    sx={{
                      position: 'absolute',
                      left: `${(index / (TOTAL_BARS - 1)) * 100}%`,
                      transform: 'translateX(-50%) rotate(-45deg)',
                      transformOrigin: 'top',
                      color: '#666',
                      fontWeight: 'bold',
                      fontSize: '0.75rem',
                    }}
                  >
                    {item.time}
                  </Typography>
                ),
            )}
          </Box>
        </Box>
      </Box>
    </Box>
  );
});
