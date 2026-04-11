const BASE = '/api';

async function request(path: string, options?: RequestInit) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(`${BASE}${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    });
    clearTimeout(timeout);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `HTTP ${res.status}`);
    }
    return res.json();
  } catch (e: any) {
    clearTimeout(timeout);
    throw e;
  }
}

export const api = {
  // Auth
  checkAuth: () => request('/auth/check'),
  login: (username: string, password: string) =>
    request('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }),
  logout: () => request('/auth/logout', { method: 'POST' }),

  // Status
  getStatus: () => request('/status'),

  // Accounts
  getAccounts: () => request('/accounts'),
  createAccount: (username: string, password: string, displayName?: string) =>
    request('/accounts', { method: 'POST', body: JSON.stringify({ username, password, displayName }) }),
  updateAccount: (username: string, data: { password?: string; displayName?: string }) =>
    request(`/accounts/${username}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteAccount: (username: string) =>
    request(`/accounts/${username}`, { method: 'DELETE' }),
};
