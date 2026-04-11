import { useState, useEffect } from 'react';
import { api } from '../api';
import DeviceStatus from '../components/DeviceStatus';
import ActiveCalls from '../components/ActiveCalls';

interface StatusData {
  registrations: any[];
  calls: any[];
  uptime: number;
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export default function Dashboard() {
  const [status, setStatus] = useState<StatusData | null>(null);
  const [error, setError] = useState('');

  const fetchStatus = () => {
    api.getStatus()
      .then(setStatus)
      .catch((err) => setError(err.message));
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  if (error) {
    return (
      <div style={styles.error}>
        <span style={{ marginRight: '6px' }}>Error:</span>{error}
      </div>
    );
  }

  if (!status) {
    return <div style={styles.loading}>Loading status...</div>;
  }

  return (
    <div style={styles.container}>
      {/* Stats bar */}
      <div style={styles.statsGrid}>
        <div style={styles.statCard}>
          <div style={styles.statIcon}>
            <span style={styles.statDot(status.registrations.length > 0)} />
          </div>
          <div style={styles.statValue}>{status.registrations.length}</div>
          <div style={styles.statLabel}>Devices Online</div>
        </div>
        <div style={styles.statCard}>
          <div style={styles.statValue}>{status.calls.length}</div>
          <div style={styles.statLabel}>Active Calls</div>
        </div>
        <div style={styles.statCard}>
          <div style={styles.statValue}>{formatUptime(status.uptime)}</div>
          <div style={styles.statLabel}>Uptime</div>
        </div>
      </div>

      {/* Registered Devices */}
      <div style={styles.section}>
        <div style={styles.sectionHeader}>
          Registered Devices
          <span style={styles.sectionBadge}>{status.registrations.length}</span>
        </div>
        <DeviceStatus registrations={status.registrations} />
      </div>

      {/* Active Calls */}
      <div style={styles.section}>
        <div style={styles.sectionHeader}>
          Active Calls
          <span style={styles.sectionBadge}>{status.calls.length}</span>
        </div>
        <ActiveCalls calls={status.calls} />
      </div>
    </div>
  );
}

const styles = {
  container: {
    display: 'flex', flexDirection: 'column' as const, gap: '16px',
  },
  loading: {
    color: '#8aa4c8', textAlign: 'center' as const, padding: '24px',
  },
  error: {
    padding: '9px 12px', background: '#3a0f0f',
    borderLeft: '3px solid #ef4444', borderRadius: '5px',
    fontSize: '13px', color: '#fca5a5',
  },
  statsGrid: {
    display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px',
  },
  statCard: {
    background: '#0d2346',
    border: '1px solid #17345f',
    borderRadius: '12px',
    padding: '18px',
    textAlign: 'center' as const,
    boxShadow: '0 3px 10px rgba(0,0,0,.16)',
    transition: 'transform .14s, box-shadow .14s',
  },
  statIcon: {
    marginBottom: '4px',
  },
  statDot: (active: boolean): React.CSSProperties => ({
    display: 'inline-block',
    width: '9px', height: '9px', borderRadius: '50%',
    background: active ? '#22c55e' : '#8aa4c8',
    boxShadow: active ? '0 0 6px rgba(34,197,94,.6)' : 'none',
  }),
  statValue: {
    fontSize: '28px', fontWeight: 800, color: '#eef5ff',
    fontVariantNumeric: 'tabular-nums' as const,
  },
  statLabel: {
    fontSize: '11px', color: '#8aa4c8',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.08em', fontWeight: 700,
    marginTop: '2px',
  },
  section: {
    marginTop: '4px',
  },
  sectionHeader: {
    fontSize: '11px', fontWeight: 700, color: '#8aa4c8',
    letterSpacing: '0.08em', textTransform: 'uppercase' as const,
    marginBottom: '10px', paddingBottom: '6px',
    borderBottom: '1px solid #17345f',
    display: 'flex', alignItems: 'center', gap: '8px',
  },
  sectionBadge: {
    fontSize: '11px', padding: '2px 8px', borderRadius: '999px',
    background: '#1e3a5f', color: '#17a8ff',
  },
};
