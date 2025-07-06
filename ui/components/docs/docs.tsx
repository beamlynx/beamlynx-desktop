import { Introduction } from './intro';
import { Navigation } from './navigate';

export const Documentation = (
  <div style={{ display: 'flex', margin: 20 }}>
    <div
      style={{
        color: 'grey',
        textAlign: 'left',
        userSelect: 'none',
      }}
    >
      {Introduction}
    </div>
  </div>
);
