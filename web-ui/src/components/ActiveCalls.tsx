import type React from 'react';

interface CallInfo {
  callId: string;
  caller: string;
  callee: string;
  startedAt: number;
  duration: number;
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default function ActiveCalls({ calls }: { calls: CallInfo[] }) {
  if (calls.length === 0) {
    return (
      <div style={styles.empty}>
        <span style={{ color: '#8aa4c8' }}>No active calls</span>
      </div>
    );
  }

  return (
    <div style={styles.list}>
      {calls.map((c) => (
        <div key={c.callId} style={styles.card}>
          <div style={styles.cardHeader}>
            <span style={styles.dot} />
            <strong style={{ fontSize: '13px' }}>Active Call</strong>
            <span style={styles.duration}>{formatDuration(c.duration)}</span>
          </div>
          <div style={styles.rows}>
            <div style={styles.row}>
              <span style={styles.rowLabel}>Caller</span>
              <span style={styles.callerValue}>{c.caller}</span>
            </div>
            <div style={styles.row}>
              <span style={styles.rowLabel}>Callee</span>
              <span style={styles.calleeValue}>{c.callee}</span>
            </div>
          </div>
          {/* Level bar style indicator */}
          <div style={styles.barWrap}>
            <div style={styles.barTrack}>
              <div style={styles.barFill} />
            </div>
            <span style={styles.barLabel}>LIVE</span>
          </div>
        </div>
      ))}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  empty: {
    textAlign: 'center', padding: '24px',
    background: '#0d2346', borderRadius: '12px', border: '1px solid #17345f',
    boxShadow: '0 3px 10px rgba(0,0,0,.16)',
  },
  list: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
    gap: '16px',
  },
  card: {
    background: '#0d2346',
    border: '1px solid #17345f',
    borderLeft: '4px solid #22c55e',
    borderRadius: '12px',
    overflow: 'hidden',
    boxShadow: '0 3px 10px rgba(0,0,0,.16)',
  },
  cardHeader: {
    padding: '9px 13px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    borderBottom: '1px solid #17345f',
    background: 'linear-gradient(180deg, #143766, #102b54)',
  },
  dot: {
    width: '9px', height: '9px', borderRadius: '50%',
    background: '#22c55e',
    animation: 'pulse 2s infinite',
    flexShrink: 0,
  },
  duration: {
    marginLeft: 'auto',
    fontFamily: 'monospace', fontSize: '14px', fontWeight: 700,
    color: '#f59e0b',
    fontVariantNumeric: 'tabular-nums',
  },
  rows: {
    padding: '8px 13px',
  },
  row: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '5px 0', borderBottom: '1px solid #17345f',
    fontSize: '12px', lineHeight: '1.45',
  },
  rowLabel: {
    color: '#8aa4c8',
  },
  callerValue: {
    fontWeight: 600, color: '#17a8ff',
  },
  calleeValue: {
    fontWeight: 600, color: '#22c55e',
  },
  barWrap: {
    padding: '8px 13px',
    borderTop: '1px solid #17345f',
    display: 'flex', alignItems: 'center', gap: '8px',
  },
  barTrack: {
    flex: 1, height: '7px',
    background: '#123764', borderRadius: '4px', overflow: 'hidden',
  },
  barFill: {
    height: '7px', borderRadius: '4px',
    background: '#22c55e', width: '100%',
    transition: 'width .4s',
  },
  barLabel: {
    fontSize: '11px', fontWeight: 700, color: '#22c55e',
    letterSpacing: '0.08em',
  },
};
