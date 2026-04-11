import { Router, type Request, type Response } from 'express';
import { loadServerConfig } from '../../src/config';

const router = Router();
const config = loadServerConfig();

router.post('/login', (req: Request, res: Response) => {
  const { username, password } = req.body;

  if (username === config.web.adminUser && password === config.web.adminPassword) {
    (req.session as any).authenticated = true;
    res.json({ ok: true });
  } else {
    res.status(401).json({ error: 'Invalid credentials' });
  }
});

router.post('/logout', (req: Request, res: Response) => {
  req.session.destroy(() => {
    res.json({ ok: true });
  });
});

router.get('/check', (req: Request, res: Response) => {
  res.json({ authenticated: !!(req.session as any)?.authenticated });
});

export default router;
