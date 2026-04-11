import { useState } from 'react';
import type React from 'react';
import { api } from '../api';

export default function Login({ onLogin }: { onLogin: () => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await api.login(username, password);
      onLogin();
    } catch (err: any) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.wrapper}>
      <div style={styles.box}>
        <div style={styles.logoWrap}>
          <img src="/sipscope_icon.png" alt="SIPScope" style={styles.logo} />
        </div>
        <h1 style={styles.heading}>SIPScope</h1>
        <div style={styles.sub}>SIP Server Management</div>
        <div style={styles.statusLine}>
          <span style={styles.statusDot} />
          <span style={styles.statusText}>System online</span>
        </div>

        {error && (
          <div style={styles.error}>
            <span style={{ marginRight: '6px' }}>Warning:</span>{error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <label style={styles.label}>
            Username
            <input
              style={styles.input}
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoFocus
              autoComplete="username"
            />
          </label>
          <label style={styles.label}>
            Password
            <input
              style={styles.input}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </label>
          <button style={styles.button} type="submit" disabled={loading}>
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    minHeight: '100vh',
  },
  box: {
    background: '#0d2346',
    border: '1px solid #17345f',
    borderRadius: '12px',
    padding: '32px',
    width: '100%',
    maxWidth: '380px',
    boxShadow: '0 20px 60px rgba(0,0,0,.28)',
  },
  logoWrap: {
    textAlign: 'center', marginBottom: '14px',
  },
  logo: {
    width: '80px', height: '80px',
    filter: 'drop-shadow(0 8px 22px rgba(23,168,255,.20))',
  },
  heading: {
    fontSize: '20px', textAlign: 'center', color: '#eef5ff', marginBottom: '6px',
  },
  sub: {
    color: '#8aa4c8', fontSize: '13px', textAlign: 'center', marginBottom: '4px',
  },
  statusLine: {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    gap: '6px', marginBottom: '16px',
  },
  statusDot: {
    width: '7px', height: '7px', borderRadius: '50%',
    background: '#22c55e', display: 'inline-block',
    boxShadow: '0 0 6px rgba(34,197,94,.6)',
  },
  statusText: {
    fontSize: '12px', color: '#8aa4c8',
  },
  error: {
    marginTop: '12px', marginBottom: '8px',
    padding: '9px 12px',
    background: '#3a0f0f',
    borderLeft: '3px solid #ef4444',
    borderRadius: '5px',
    fontSize: '13px',
    color: '#fca5a5',
  },
  label: {
    display: 'block', marginTop: '14px',
    color: '#8aa4c8', fontSize: '12px', fontWeight: 600,
    textTransform: 'uppercase' as const, letterSpacing: '0.05em',
  },
  input: {
    width: '100%', marginTop: '4px',
    padding: '9px 11px',
    background: '#173a69',
    border: '1px solid #17345f',
    borderRadius: '7px',
    color: '#eef5ff',
    fontSize: '14px',
  },
  button: {
    width: '100%', marginTop: '20px',
    padding: '10px',
    background: '#17a8ff',
    color: '#fff',
    border: 'none',
    borderRadius: '7px',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
    boxShadow: '0 2px 8px rgba(23,168,255,.25)',
  },
};
