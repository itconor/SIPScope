import { Router, type Request, type Response } from 'express';
import { loadServerConfig, loadAccounts, saveAccounts, getAccount } from '../../src/config';
import { computeHA1 } from '../../src/auth';
import type { SipAccount } from '../../src/types';

const router = Router();
const config = loadServerConfig();

// GET /api/accounts - list all accounts
router.get('/', (_req: Request, res: Response) => {
  const accounts = loadAccounts();
  const list = Array.from(accounts.values()).map((a) => ({
    username: a.username,
    realm: a.realm,
    displayName: a.displayName || '',
  }));
  res.json(list);
});

// POST /api/accounts - create account
router.post('/', (req: Request, res: Response) => {
  const { username, password, displayName } = req.body;

  if (!username || !password) {
    res.status(400).json({ error: 'username and password required' });
    return;
  }

  const accounts = loadAccounts();
  if (accounts.has(username)) {
    res.status(409).json({ error: 'Account already exists' });
    return;
  }

  const ha1 = computeHA1(username, config.realm, password);
  const account: SipAccount = {
    username,
    ha1,
    realm: config.realm,
    displayName: displayName || undefined,
  };

  accounts.set(username, account);
  saveAccounts(accounts);

  res.status(201).json({ username, realm: config.realm, displayName: displayName || '' });
});

// PUT /api/accounts/:username - update account
router.put('/:username', (req: Request, res: Response) => {
  const username = req.params.username as string;
  const { password, displayName } = req.body;

  const accounts = loadAccounts();
  const existing = accounts.get(username);

  if (!existing) {
    res.status(404).json({ error: 'Account not found' });
    return;
  }

  if (password) {
    existing.ha1 = computeHA1(username, config.realm, password);
  }
  if (displayName !== undefined) {
    existing.displayName = displayName || undefined;
  }

  accounts.set(username, existing);
  saveAccounts(accounts);

  res.json({ username, realm: config.realm, displayName: existing.displayName || '' });
});

// DELETE /api/accounts/:username - delete account
router.delete('/:username', (req: Request, res: Response) => {
  const username = req.params.username as string;

  const accounts = loadAccounts();
  if (!accounts.has(username)) {
    res.status(404).json({ error: 'Account not found' });
    return;
  }

  accounts.delete(username);
  saveAccounts(accounts);

  res.json({ ok: true });
});

export default router;
