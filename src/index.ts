import * as sip from 'sip';
import fs from 'fs';
import path from 'path';
import { loadServerConfig, loadAccounts, watchAccounts } from './config';
import { handleRegister } from './registrar';
import { handleInvite, handleBye, handleCancel, handleAck } from './call-handler';
import { startExpiryTimer } from './location-service';
import { startWebServer } from '../web/server';
import logger from './logger';

const config = loadServerConfig();

function start(): void {
  logger.info({ domain: config.domain, sipPort: config.sip.port }, 'Starting SIP server');

  // Load accounts
  const accounts = loadAccounts();
  logger.info({ count: accounts.size }, 'Loaded SIP accounts');

  // Watch for account changes
  watchAccounts(() => {
    logger.info('Accounts reloaded');
  });

  // Start registration expiry timer
  startExpiryTimer();

  // SIP stack options
  const sipOptions: any = {
    port: config.sip.port,
    address: '0.0.0.0',
    publicAddress: config.publicIp !== '0.0.0.0' ? config.publicIp : undefined,
    logger: {
      send: (message: string, address: string) => {
        logger.trace({ direction: 'out', address }, 'SIP message sent');
      },
      recv: (message: string, address: string) => {
        logger.trace({ direction: 'in', address }, 'SIP message received');
      },
      error: (err: any) => {
        logger.error({ err }, 'SIP transport error');
      },
    },
  };

  // Add TLS if certs exist
  const certsDir = path.resolve(__dirname, '..', 'certs');
  const certPath = path.join(certsDir, 'server.crt');
  const keyPath = path.join(certsDir, 'server.key');

  if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
    sipOptions.tls = {
      cert: fs.readFileSync(certPath),
      key: fs.readFileSync(keyPath),
    };
    sipOptions.tls_port = config.sip.tlsPort;
    logger.info({ tlsPort: config.sip.tlsPort }, 'TLS enabled');
  } else {
    logger.warn('No TLS certificates found in certs/ — running without TLS');
  }

  // Add WebSocket port
  if (config.sip.wsPort) {
    sipOptions.ws_port = config.sip.wsPort;
    logger.info({ wsPort: config.sip.wsPort }, 'WebSocket SIP enabled');
  }

  // Start SIP stack
  sip.start(sipOptions, (request: any, remote: any) => {
    const method = request.method;
    const remoteInfo = {
      address: remote.address,
      port: remote.port,
      protocol: remote.protocol || 'UDP',
    };

    logger.debug({ method, from: remote.address, port: remote.port }, 'SIP request received');

    try {
      switch (method) {
        case 'REGISTER':
          handleRegister(request, remoteInfo);
          break;
        case 'INVITE':
          handleInvite(request, remoteInfo);
          break;
        case 'BYE':
          handleBye(request, remoteInfo);
          break;
        case 'CANCEL':
          handleCancel(request, remoteInfo);
          break;
        case 'ACK':
          handleAck(request, remoteInfo);
          break;
        case 'OPTIONS':
          // Keepalive / health check
          sip.send(sip.makeResponse(request, 200, 'OK'));
          break;
        default:
          sip.send(sip.makeResponse(request, 405, 'Method Not Allowed'));
          break;
      }
    } catch (err) {
      logger.error({ err, method }, 'Error handling SIP request');
      try {
        sip.send(sip.makeResponse(request, 500, 'Server Internal Error'));
      } catch (_) {
        // Ignore send errors on error responses
      }
    }
  });

  logger.info({ port: config.sip.port }, 'SIP server listening');

  // Start web admin UI
  startWebServer();

  // Graceful shutdown
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

function shutdown(): void {
  logger.info('Shutting down...');
  sip.stop();
  process.exit(0);
}

start();
