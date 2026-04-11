import { useState, useEffect } from 'react';
import { api } from './api';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Accounts from './pages/Accounts';

type Page = 'dashboard' | 'accounts';

export default function App() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [page, setPage] = useState<Page>('dashboard');

  useEffect(() => {
    api.checkAuth()
      .then((res) => setAuthenticated(res.authenticated))
      .catch(() => setAuthenticated(false));
  }, []);

  if (authenticated === null) {
    return <div style={styles.loading}>Loading...</div>;
  }

  if (!authenticated) {
    return <Login onLogin={() => setAuthenticated(true)} />;
  }

  const navBtn = (p: Page, label: string) => ({
    ...styles.navBtn,
    ...(page === p ? styles.navActive : {}),
  });

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <div style={styles.headerLeft}>
          <img src="/sipscope_icon.png" alt="" style={styles.headerIcon} />
          <h1 style={styles.title}>SIPScope</h1>
          <span style={styles.badge}>SIP Server</span>
        </div>
        <nav style={styles.nav}>
          <button style={navBtn('dashboard', 'Dashboard')} onClick={() => setPage('dashboard')}>
            Dashboard
          </button>
          <button style={navBtn('accounts', 'Accounts')} onClick={() => setPage('accounts')}>
            Accounts
          </button>
          <button
            style={styles.logoutBtn}
            onClick={() => api.logout().then(() => setAuthenticated(false))}
          >
            Logout
          </button>
        </nav>
      </header>
      <main style={styles.main}>
        {page === 'dashboard' && <Dashboard />}
        {page === 'accounts' && <Accounts />}
      </main>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  loading: {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    height: '100vh', color: '#8aa4c8', fontSize: '1rem',
  },
  container: {
    minHeight: '100vh',
  },
  header: {
    background: 'linear-gradient(180deg, rgba(10,31,65,.96), rgba(9,24,48,.96))',
    borderBottom: '1px solid #17345f',
    padding: '12px 20px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: '10px',
    boxShadow: '0 10px 24px rgba(0,0,0,.18)',
  },
  headerLeft: {
    display: 'flex', alignItems: 'center', gap: '10px',
  },
  headerIcon: {
    width: '28px', height: '28px', borderRadius: '6px',
    filter: 'drop-shadow(0 0 8px rgba(23,168,255,.3))',
  },
  title: {
    fontSize: '17px', fontWeight: 700, color: '#eef5ff',
  },
  badge: {
    fontSize: '11px', padding: '2px 8px', borderRadius: '999px',
    background: '#1e3a5f', color: '#17a8ff',
  },
  nav: {
    display: 'flex', gap: '6px', flexWrap: 'wrap',
  },
  navBtn: {
    display: 'inline-block', padding: '5px 12px', borderRadius: '8px',
    fontSize: '13px', cursor: 'pointer', border: 'none',
    fontWeight: 600, background: '#17345f', color: '#eef5ff',
    transition: 'filter .15s, box-shadow .15s',
  },
  navActive: {
    background: '#17a8ff', color: '#fff',
    boxShadow: '0 2px 8px rgba(23,168,255,.25)',
  },
  logoutBtn: {
    display: 'inline-block', padding: '5px 12px', borderRadius: '8px',
    fontSize: '13px', cursor: 'pointer', border: 'none',
    fontWeight: 600, background: '#ef4444', color: '#fff',
    marginLeft: '8px',
    transition: 'filter .15s',
  },
  main: {
    padding: '16px', maxWidth: '1440px', margin: '0 auto',
  },
};
