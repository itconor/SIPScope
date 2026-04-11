const sip = require('./sip-patched');
import { loadServerConfig } from './config';
import { challengeRequest, authenticateRequest } from './auth';
import { addRegistration, removeRegistration } from './location-service';
import logger from './logger';
import type { RemoteInfo } from './types';

const config = loadServerConfig();

export function handleRegister(request: any, remote: RemoteInfo): void {
  const toHeader = request.headers.to;
  const aor = `${sip.parseUri(toHeader.uri).user}@${config.domain}`;

  // Check for authorization header
  const authResult = authenticateRequest(request);

  if (!authResult.authenticated) {
    // Send 401 challenge
    const response = sip.makeResponse(request, 401, 'Unauthorized');
    challengeRequest(request, response);
    sip.send(response);
    return;
  }

  const username = authResult.username!;

  // Check for de-registration (Expires: 0)
  const contactHeader = request.headers.contact;
  let expires = config.registrationExpiry;

  if (request.headers.expires !== undefined) {
    expires = parseInt(request.headers.expires, 10);
  }

  if (contactHeader && contactHeader.length > 0 && contactHeader[0].params?.expires !== undefined) {
    expires = parseInt(contactHeader[0].params.expires, 10);
  }

  if (expires === 0) {
    removeRegistration(aor);
    const response = sip.makeResponse(request, 200, 'OK');
    response.headers.contact = contactHeader;
    response.headers.expires = 0;
    sip.send(response);
    return;
  }

  // Cap expires to our configured max
  if (expires > config.registrationExpiry) {
    expires = config.registrationExpiry;
  }

  // Store registration with NAT-aware info
  const contact = contactHeader && contactHeader.length > 0
    ? sip.stringifyUri(contactHeader[0].uri)
    : undefined;

  const userAgent = request.headers['user-agent'] || 'Unknown';

  addRegistration({
    aor,
    username,
    contact: contact || `sip:${username}@${remote.address}:${remote.port}`,
    receivedHost: remote.address,
    receivedPort: remote.port,
    receivedProtocol: remote.protocol || 'UDP',
    expires: Math.floor(Date.now() / 1000) + expires,
    callId: request.headers['call-id'],
    cSeq: request.headers.cseq.seq,
    userAgent,
    registeredAt: Date.now(),
  });

  // Send 200 OK
  const response = sip.makeResponse(request, 200, 'OK');
  if (contactHeader) {
    response.headers.contact = contactHeader.map((c: any) => ({
      ...c,
      params: { ...c.params, expires },
    }));
  }
  response.headers.expires = expires;
  sip.send(response);
}
