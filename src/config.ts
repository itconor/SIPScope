import fs from 'fs';
import path from 'path';
import type { ServerConfig, SipAccount } from './types';

const CONFIG_DIR = path.resolve(__dirname, '..', 'config');

let serverConfig: ServerConfig | null = null;
let accountsCache: Map<string, SipAccount> = new Map();
let accountsWatcher: fs.FSWatcher | null = null;
let onAccountsReload: (() => void) | null = null;

export function loadServerConfig(): ServerConfig {
  if (serverConfig) return serverConfig;

  const configPath = path.join(CONFIG_DIR, 'server.json');
  if (!fs.existsSync(configPath)) {
    throw new Error(`Server config not found: ${configPath}`);
  }

  serverConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  return serverConfig!;
}

export function loadAccounts(): Map<string, SipAccount> {
  const accountsPath = path.join(CONFIG_DIR, 'accounts.json');
  if (!fs.existsSync(accountsPath)) {
    accountsCache = new Map();
    return accountsCache;
  }

  const data = JSON.parse(fs.readFileSync(accountsPath, 'utf-8'));
  accountsCache = new Map();

  for (const [username, account] of Object.entries(data)) {
    accountsCache.set(username, {
      username,
      ...(account as Omit<SipAccount, 'username'>),
    });
  }

  return accountsCache;
}

export function getAccount(username: string): SipAccount | undefined {
  if (accountsCache.size === 0) loadAccounts();
  return accountsCache.get(username);
}

export function getAllAccounts(): SipAccount[] {
  if (accountsCache.size === 0) loadAccounts();
  return Array.from(accountsCache.values());
}

export function saveAccounts(accounts: Map<string, SipAccount>): void {
  const accountsPath = path.join(CONFIG_DIR, 'accounts.json');
  const data: Record<string, Omit<SipAccount, 'username'>> = {};

  for (const [username, account] of accounts) {
    const { username: _, ...rest } = account;
    data[username] = rest;
  }

  fs.writeFileSync(accountsPath, JSON.stringify(data, null, 2) + '\n');
  accountsCache = new Map(accounts);
}

export function watchAccounts(callback: () => void): void {
  onAccountsReload = callback;
  const accountsPath = path.join(CONFIG_DIR, 'accounts.json');

  if (accountsWatcher) accountsWatcher.close();

  let debounceTimer: NodeJS.Timeout | null = null;
  accountsWatcher = fs.watch(accountsPath, () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      loadAccounts();
      if (onAccountsReload) onAccountsReload();
    }, 500);
  });
}
