import { Introduction } from './intro';
import { Navigation } from './navigate';

export const Documentation = (
  <div style={{ display: 'flex', margin: 20 }}>
    <div style={{ color: 'grey', textAlign: 'left', width: '60%' }}>{Introduction}</div>
    <div style={{ color: 'grey', textAlign: 'left', width: '40%' }}>{Navigation}</div>
  </div>
);
