import pino from 'pino';
import { loadServerConfig } from './config';

const config = loadServerConfig();

const logger = pino({
  level: config.logLevel || 'info',
  transport: {
    target: 'pino/file',
    options: { destination: 1 },
  },
});

export default logger;
