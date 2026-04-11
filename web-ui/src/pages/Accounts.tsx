import { useState, useEffect } from 'react';
import type React from 'react';
import { api } from '../api';

interface Account {
  username: string;
  realm: string;
  displayName: string;
}

export default function Accounts() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editUser, setEditUser] = useState<string | null>(null);
  const [form, setForm] = useState({ username: '', password: '', displayName: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const fetchAccounts = () => {
    api.getAccounts().then(setAccounts).catch((err) => setError(err.message));
  };

  useEffect(() => { fetchAccounts(); }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (editUser) {
        await api.updateAccount(editUser, {
          password: form.password || undefined,
          displayName: form.displayName,
        });
      } else {
        await api.createAccount(form.username, form.password, form.displayName);
      }
      setShowForm(false);
      setEditUser(null);
      setForm({ username: '', password: '', displayName: '' });
      fetchAccounts();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (username: string) => {
    if (!confirm(`Delete account "${username}"?`)) return;
    try {
      await api.deleteAccount(username);
      fetchAccounts();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const startEdit = (account: Account) => {
    setEditUser(account.username);
    setForm({ username: account.username, password: '', displayName: account.displayName });
    setShowForm(true);
  };

  return (
    <div style={styles.container}>
      {/* Section header */}
      <div style={styles.sectionHeader}>
        <span>SIP Accounts</span>
        <span style={styles.badge}>{accounts.length}</span>
        {!showForm && (
          <button
            style={styles.addBtn}
            onClick={() => { setShowForm(true); setEditUser(null); setForm({ username: '', password: '', displayName: '' }); }}
          >
            + Add Account
          </button>
        )}
      </div>

      {error && <div style={styles.error}>{error}</div>}

      {/* Add/Edit form */}
      {showForm && (
        <div style={styles.formCard}>
          <div style={styles.formHeader}>
            {editUser ? `Edit: ${editUser}` : 'New Account'}
          </div>
          <form onSubmit={handleSubmit} style={styles.formBody}>
            {!editUser && (
              <label style={styles.label}>
                Username
                <input
                  style={styles.input}
                  value={form.username}
                  onChange={(e) => setForm({ ...form, username: e.target.value })}
                  required
                  autoFocus
                />
              </label>
            )}
            <label style={styles.label}>
              {editUser ? 'New Password' : 'Password'}
              <input
                style={styles.input}
                type="password"
                placeholder={editUser ? 'Leave blank to keep current' : ''}
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                required={!editUser}
              />
            </label>
            <label style={styles.label}>
              Display Name
              <input
                style={styles.input}
                placeholder="Optional"
                value={form.displayName}
                onChange={(e) => setForm({ ...form, displayName: e.target.value })}
              />
            </label>
            <div style={styles.formActions}>
              <button style={styles.saveBtn} type="submit" disabled={loading}>
                {loading ? 'Saving...' : 'Save'}
              </button>
              <button
                style={styles.cancelBtn}
                type="button"
                onClick={() => { setShowForm(false); setEditUser(null); }}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Account cards */}
      {accounts.length === 0 ? (
        <div style={styles.empty}>
          No accounts configured. Add one to get started.
        </div>
      ) : (
        <div style={styles.grid}>
          {accounts.map((a) => (
            <div key={a.username} style={styles.card}>
              <div style={styles.cardHeader}>
                <span style={styles.dot} />
                <strong style={{ fontSize: '13px' }}>{a.username}</strong>
                {a.displayName && (
                  <span style={styles.displayName}>{a.displayName}</span>
                )}
              </div>
              <div style={styles.rows}>
                <div style={styles.row}>
                  <span style={styles.rowLabel}>Realm</span>
                  <span style={styles.rowValueMono}>{a.realm}</span>
                </div>
                <div style={styles.row}>
                  <span style={styles.rowLabel}>Status</span>
                  <span style={{ fontSize: '12px', color: '#22c55e' }}>Ready</span>
                </div>
              </div>
              <div style={styles.cardActions}>
                <button style={styles.editBtn} onClick={() => startEdit(a)}>Edit</button>
                <button style={styles.deleteBtn} onClick={() => handleDelete(a.username)}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex', flexDirection: 'column', gap: '16px',
  },
  sectionHeader: {
    fontSize: '11px', fontWeight: 700, color: '#8aa4c8',
    letterSpacing: '0.08em', textTransform: 'uppercase',
    paddingBottom: '6px', borderBottom: '1px solid #17345f',
    display: 'flex', alignItems: 'center', gap: '8px',
  },
  badge: {
    fontSize: '11px', padding: '2px 8px', borderRadius: '999px',
    background: '#1e3a5f', color: '#17a8ff',
  },
  addBtn: {
    marginLeft: 'auto',
    padding: '5px 12px', background: '#17a8ff', border: 'none',
    borderRadius: '8px', color: '#fff', cursor: 'pointer',
    fontWeight: 600, fontSize: '13px',
    boxShadow: '0 2px 8px rgba(23,168,255,.25)',
  },
  error: {
    padding: '9px 12px', background: '#3a0f0f',
    borderLeft: '3px solid #ef4444', borderRadius: '5px',
    fontSize: '13px', color: '#fca5a5',
  },
  empty: {
    color: '#8aa4c8', textAlign: 'center', padding: '24px',
    background: '#0d2346', borderRadius: '12px', border: '1px solid #17345f',
    boxShadow: '0 3px 10px rgba(0,0,0,.16)',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
    gap: '16px',
  },
  card: {
    background: '#0d2346', border: '1px solid #17345f',
    borderRadius: '12px', overflow: 'hidden',
    boxShadow: '0 3px 10px rgba(0,0,0,.16)',
    transition: 'transform .14s, box-shadow .14s',
  },
  cardHeader: {
    padding: '9px 13px', display: 'flex', alignItems: 'center', gap: '8px',
    borderBottom: '1px solid #17345f',
    background: 'linear-gradient(180deg, #143766, #102b54)',
  },
  dot: {
    width: '9px', height: '9px', borderRadius: '50%',
    background: '#17a8ff', flexShrink: 0,
  },
  displayName: {
    fontSize: '11px', color: '#8aa4c8', marginLeft: 'auto',
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
  rowValueMono: {
    fontFamily: 'monospace', fontSize: '11px', color: '#8aa4c8',
  },
  cardActions: {
    padding: '8px 13px', borderTop: '1px solid #17345f',
    display: 'flex', gap: '6px',
  },
  editBtn: {
    padding: '4px 10px', background: '#17345f', border: '1px solid #17a8ff',
    borderRadius: '6px', color: '#17a8ff', cursor: 'pointer',
    fontSize: '12px', fontWeight: 600,
  },
  deleteBtn: {
    padding: '4px 10px', background: '#17345f', border: '1px solid #ef4444',
    borderRadius: '6px', color: '#ef4444', cursor: 'pointer',
    fontSize: '12px', fontWeight: 600,
  },
  // Form
  formCard: {
    background: '#0d2346', border: '1px solid #17345f',
    borderRadius: '12px', overflow: 'hidden',
    boxShadow: '0 3px 10px rgba(0,0,0,.16)',
  },
  formHeader: {
    padding: '9px 13px', fontSize: '13px', fontWeight: 700,
    borderBottom: '1px solid #17345f',
    background: 'linear-gradient(180deg, #143766, #102b54)',
  },
  formBody: {
    padding: '13px',
  },
  label: {
    display: 'block', marginTop: '13px',
    color: '#8aa4c8', fontSize: '12px', fontWeight: 600,
    textTransform: 'uppercase', letterSpacing: '0.05em',
  },
  input: {
    width: '100%', marginTop: '4px',
    padding: '8px 10px', background: '#173a69',
    border: '1px solid #17345f', borderRadius: '6px',
    color: '#eef5ff', fontSize: '14px',
  },
  formActions: {
    marginTop: '16px', paddingTop: '12px',
    borderTop: '1px solid #17345f',
    display: 'flex', gap: '8px',
  },
  saveBtn: {
    padding: '5px 12px', background: '#17a8ff', border: 'none',
    borderRadius: '8px', color: '#fff', cursor: 'pointer',
    fontWeight: 600, fontSize: '13px',
    boxShadow: '0 2px 8px rgba(23,168,255,.25)',
  },
  cancelBtn: {
    padding: '5px 12px', background: '#17345f', border: 'none',
    borderRadius: '8px', color: '#eef5ff', cursor: 'pointer',
    fontSize: '13px',
  },
};
