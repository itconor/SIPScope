import type React from 'react';

interface RegistrationInfo {
  username: string;
  aor: string;
  contact: string;
  ip: string;
  port: number;
  protocol: string;
  userAgent: string;
  registeredAt: number;
  expiresIn: number;
}

export default function DeviceStatus({ registrations }: { registrations: RegistrationInfo[] }) {
  if (registrations.length === 0) {
    return (
      <div style={styles.empty}>
        <span style={{ color: '#8aa4c8' }}>No devices registered</span>
      </div>
    );
  }

  return (
    <div style={styles.grid}>
      {registrations.map((r) => (
        <div key={r.aor} style={styles.card}>
          {/* Card header — matches SignalScope .ch */}
          <div style={styles.cardHeader}>
            <span style={styles.dot} />
            <strong style={{ fontSize: '13px' }}>{r.username}</strong>
            <span style={styles.deviceId}>{r.userAgent}</span>
          </div>
          {/* Card rows — matches SignalScope .rows */}
          <div style={styles.rows}>
            <div style={styles.row}>
              <span style={styles.rowLabel}>IP Address</span>
              <span style={styles.rowValue}>{r.ip}:{r.port}</span>
            </div>
            <div style={styles.row}>
              <span style={styles.rowLabel}>Protocol</span>
              <span style={styles.rowValue}>{r.protocol}</span>
            </div>
            <div style={styles.row}>
              <span style={styles.rowLabel}>Contact</span>
              <span style={styles.rowValueMono}>{r.contact}</span>
            </div>
            <div style={styles.row}>
              <span style={styles.rowLabel}>Expires in</span>
              <span style={styles.rowValue}>{r.expiresIn}s</span>
            </div>
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
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
    gap: '16px',
  },
  card: {
    background: '#0d2346',
    border: '1px solid #17345f',
    borderRadius: '12px',
    overflow: 'hidden',
    boxShadow: '0 3px 10px rgba(0,0,0,.16)',
    transition: 'transform .14s, box-shadow .14s',
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
    boxShadow: '0 0 6px rgba(34,197,94,.5)',
    flexShrink: 0,
  },
  deviceId: {
    fontSize: '11px', color: '#8aa4c8',
    marginLeft: 'auto',
    overflow: 'hidden', textOverflow: 'ellipsis',
    maxWidth: '140px', whiteSpace: 'nowrap',
  },
  rows: {
    padding: '8px 13px',
  },
  row: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '5px 0', borderBottom: '1px solid #17345f',
    fontSize: '12px', gap: '8px', lineHeight: '1.45',
  },
  rowLabel: {
    color: '#8aa4c8', flexShrink: 0,
  },
  rowValue: {
    textAlign: 'right', wordBreak: 'break-word', color: '#eef5ff',
  },
  rowValueMono: {
    textAlign: 'right', wordBreak: 'break-all',
    fontFamily: 'monospace', fontSize: '11px', color: '#8aa4c8',
  },
};
