import express from 'express';
import session from 'express-session';
import path from 'path';
import { loadServerConfig } from '../src/config';
import { requireAuth } from './middleware/auth';
import authRoutes from './routes/auth';
import accountRoutes from './routes/accounts';
import statusRoutes from './routes/status';
import logger from '../src/logger';

const config = loadServerConfig();

export function startWebServer(): void {
  const app = express();

  app.use(express.json());
  app.use(session({
    secret: config.web.sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      httpOnly: true,
      sameSite: 'lax',
    },
  }));

  // API routes
  app.use('/api/auth', authRoutes);
  app.use('/api/accounts', requireAuth, accountRoutes);
  app.use('/api/status', requireAuth, statusRoutes);

  // Serve React SPA
  const publicDir = path.resolve(__dirname, 'public');
  app.use(express.static(publicDir));

  // SPA fallback - serve index.html for all non-API routes
  app.get('/{*splat}', (_req, res) => {
    res.sendFile(path.join(publicDir, 'index.html'));
  });

  app.listen(config.web.port, () => {
    logger.info({ port: config.web.port }, 'Web admin UI listening');
  });
}
