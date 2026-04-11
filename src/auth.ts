import * as digest from 'sip/digest';
import { getAccount } from './config';
import { loadServerConfig } from './config';
import logger from './logger';

const config = loadServerConfig();
const authSessions = new Map<string, any>();

export function challengeRequest(request: any, response: any): any {
  const realm = config.realm;
  const ctx: any = { realm };
  // Key by Call-ID only — the client's auth retry keeps the same Call-ID
  // but increments CSeq
  const sessionKey = request.headers['call-id'];

  digest.challenge(ctx, response);
  authSessions.set(sessionKey, ctx);

  // Clean up old sessions after 60 seconds
  setTimeout(() => authSessions.delete(sessionKey), 60_000);

  return response;
}

export function authenticateRequest(request: any): { authenticated: boolean; username?: string } {
  const authHeader = request.headers.authorization;
  if (!authHeader || authHeader.length === 0) {
    return { authenticated: false };
  }

  // Extract username from authorization header
  const auth = authHeader[0];
  const username = auth.username?.replace(/"/g, '');
  if (!username) {
    return { authenticated: false };
  }

  const account = getAccount(username);
  if (!account) {
    logger.warn({ username }, 'Auth attempt for unknown user');
    return { authenticated: false };
  }

  // Find the auth session context by Call-ID
  const sessionKey = request.headers['call-id'];
  const ctx = authSessions.get(sessionKey);

  if (!ctx) {
    logger.warn({ username, callId: sessionKey }, 'Auth attempt with no matching challenge');
    return { authenticated: false };
  }

  const valid = digest.authenticateRequest(ctx, request, { hash: account.ha1 });

  if (valid) {
    authSessions.delete(sessionKey);
    logger.info({ username }, 'Authentication successful');
    return { authenticated: true, username };
  }

  logger.warn({ username }, 'Authentication failed');
  return { authenticated: false };
}

export function computeHA1(username: string, realm: string, password: string): string {
  return digest.calculateUserRealmPasswordHash(username, realm, password);
}
