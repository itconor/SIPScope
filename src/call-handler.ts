const sip = require('./sip-patched');
import { loadServerConfig } from './config';
import { getRegistration, findRegistrationByUsername } from './location-service';
import * as rtpengine from './rtpengine';
import logger from './logger';
import type { ActiveCall, RemoteInfo } from './types';

const config = loadServerConfig();
const activeCalls = new Map<string, ActiveCall>();

// Map B-leg Call-ID back to A-leg
const bLegToALeg = new Map<string, string>();

function extractTag(header: any): string {
  return header?.params?.tag || '';
}

function resolveCallee(uri: string): { username: string; host: string; port: number } | null {
  const parsed = sip.parseUri(uri);
  const username = parsed.user;

  if (!username) return null;

  // Look up the registration for the target user
  const reg = findRegistrationByUsername(username);
  if (!reg) {
    // Try by full AOR
    const aor = `${username}@${config.domain}`;
    const regByAor = getRegistration(aor);
    if (!regByAor) return null;
    return {
      username,
      host: regByAor.receivedHost,
      port: regByAor.receivedPort,
    };
  }

  return {
    username,
    host: reg.receivedHost,
    port: reg.receivedPort,
  };
}

export function handleInvite(request: any, remote: RemoteInfo): void {
  const callId = request.headers['call-id'];
  const fromTag = extractTag(request.headers.from);
  const callerUri = request.headers.from.uri;
  const callerUser = sip.parseUri(callerUri).user || 'unknown';

  logger.info({ callId, from: callerUser, uri: request.uri }, 'Incoming INVITE');

  // Resolve callee
  const callee = resolveCallee(request.uri);
  if (!callee) {
    logger.warn({ callId, uri: request.uri }, 'Callee not found');
    sip.send(sip.makeResponse(request, 404, 'Not Found'));
    return;
  }

  logger.info({ callId, caller: callerUser, callee: callee.username }, 'Routing call');

  // Send 100 Trying
  sip.send(sip.makeResponse(request, 100, 'Trying'));

  // Process SDP through rtpengine
  const sdp = request.content;
  if (!sdp) {
    logger.warn({ callId }, 'INVITE without SDP');
    sip.send(sip.makeResponse(request, 400, 'Bad Request'));
    return;
  }

  rtpengine.offer(callId, fromTag, sdp)
    .then((rewrittenSdp) => {
      // Build outbound INVITE to callee
      const outboundRequest: any = {
        method: 'INVITE',
        uri: `sip:${callee.username}@${callee.host}:${callee.port}`,
        headers: {
          to: { uri: `sip:${callee.username}@${config.domain}` },
          from: request.headers.from,
          'call-id': callId,
          cseq: { method: 'INVITE', seq: request.headers.cseq.seq },
          contact: [{ uri: `sip:${config.domain}:${config.sip.port}` }],
          'content-type': 'application/sdp',
          'max-forwards': 70,
        },
        content: rewrittenSdp,
      };

      // Copy additional headers
      if (request.headers['supported']) {
        outboundRequest.headers['supported'] = request.headers['supported'];
      }
      if (request.headers['allow']) {
        outboundRequest.headers['allow'] = request.headers['allow'];
      }

      sip.send(outboundRequest, (response: any) => {
        if (response.status >= 100 && response.status < 200) {
          // Forward provisional responses
          const provisionalResponse = sip.makeResponse(request, response.status, response.reason);
          if (response.headers.to) {
            provisionalResponse.headers.to = response.headers.to;
          }
          sip.send(provisionalResponse);
          return;
        }

        if (response.status === 200) {
          const toTag = extractTag(response.headers.to);
          const answerSdp = response.content;

          if (!answerSdp) {
            logger.warn({ callId }, '200 OK without SDP from callee');
            return;
          }

          // Process answer SDP through rtpengine
          rtpengine.answer(callId, fromTag, toTag, answerSdp)
            .then((rewrittenAnswerSdp) => {
              // Store active call
              activeCalls.set(callId, {
                callId,
                caller: callerUser,
                callee: callee.username,
                startedAt: Date.now(),
                callerTag: fromTag,
                calleeTag: toTag,
              });

              // Forward 200 OK to caller with rewritten SDP
              const okResponse = sip.makeResponse(request, 200, 'OK');
              okResponse.headers.to = response.headers.to;
              okResponse.headers.contact = [{ uri: `sip:${config.domain}:${config.sip.port}` }];
              okResponse.headers['content-type'] = 'application/sdp';
              okResponse.content = rewrittenAnswerSdp;
              sip.send(okResponse);

              logger.info({ callId, caller: callerUser, callee: callee.username }, 'Call established');
            })
            .catch((err) => {
              logger.error({ err, callId }, 'rtpengine answer failed');
              sip.send(sip.makeResponse(request, 500, 'Server Internal Error'));
            });
          return;
        }

        // Forward error responses
        if (response.status >= 300) {
          const errorResponse = sip.makeResponse(request, response.status, response.reason);
          sip.send(errorResponse);

          // Clean up rtpengine session
          rtpengine.deleteSession(callId, fromTag).catch(() => {});
          logger.info({ callId, status: response.status }, 'Call rejected by callee');
        }
      });
    })
    .catch((err) => {
      logger.error({ err, callId }, 'rtpengine offer failed');
      sip.send(sip.makeResponse(request, 500, 'Server Internal Error'));
    });
}

export function handleBye(request: any, remote: RemoteInfo): void {
  const callId = request.headers['call-id'];
  const call = activeCalls.get(callId);

  if (!call) {
    logger.warn({ callId }, 'BYE for unknown call');
    sip.send(sip.makeResponse(request, 481, 'Call/Transaction Does Not Exist'));
    return;
  }

  // Clean up rtpengine
  rtpengine.deleteSession(callId, call.callerTag, call.calleeTag).catch((err) => {
    logger.warn({ err, callId }, 'rtpengine delete failed');
  });

  activeCalls.delete(callId);

  // Send 200 OK for BYE
  sip.send(sip.makeResponse(request, 200, 'OK'));

  const duration = Math.round((Date.now() - call.startedAt) / 1000);
  logger.info({ callId, caller: call.caller, callee: call.callee, duration }, 'Call ended');
}

export function handleCancel(request: any, remote: RemoteInfo): void {
  const callId = request.headers['call-id'];
  const fromTag = extractTag(request.headers.from);

  // Clean up rtpengine if session exists
  rtpengine.deleteSession(callId, fromTag).catch(() => {});
  activeCalls.delete(callId);

  sip.send(sip.makeResponse(request, 200, 'OK'));
  logger.info({ callId }, 'Call cancelled');
}

export function handleAck(_request: any, _remote: RemoteInfo): void {
  // ACK is end-to-end, nothing to do in our proxy for now
}

export function getActiveCalls(): ActiveCall[] {
  return Array.from(activeCalls.values());
}
