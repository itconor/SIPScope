const sip = require('./sip-patched');
import { loadServerConfig } from './config';
import { getRegistration, findRegistrationByUsername } from './location-service';
import * as rtpengine from './rtpengine';
import type { BridgeMode } from './rtpengine';
import logger from './logger';
import type { ActiveCall, RemoteInfo, Registration } from './types';

const config = loadServerConfig();
const activeCalls = new Map<string, ActiveCall>();

// Map B-leg Call-ID back to A-leg
const bLegToALeg = new Map<string, string>();

function extractTag(header: any): string {
  return header?.params?.tag || '';
}

function resolveCallee(uri: any): { username: string; host: string; port: number } | null {
  // request.uri can be a parsed object or a string depending on the SIP library
  const parsed = typeof uri === 'string' ? sip.parseUri(uri) : uri;
  const username = parsed?.user;

  logger.debug({ uri, parsed, username }, 'Resolving callee');

  if (!username) return null;

  // Look up the registration for the target user
  const reg = findRegistrationByUsername(username);
  if (!reg) {
    // Try by full AOR
    const aor = `${username}@${config.domain}`;
    const regByAor = getRegistration(aor);
    if (!regByAor) {
      logger.warn({ username, aor }, 'Callee not registered');
      return null;
    }
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

/**
 * Returns true if the SDP is from a WebRTC client.
 * WebRTC always uses DTLS-SRTP (fingerprint) and ICE.
 */
function isWebRtcSdp(sdp: string): boolean {
  return /UDP\/TLS\/RTP\/SAVPF/i.test(sdp) || /^a=fingerprint:/im.test(sdp);
}

/**
 * Returns true if the registered client connected via WebSocket (WebRTC).
 */
function isWebRtcRegistration(reg: Registration): boolean {
  const proto = (reg.receivedProtocol || '').toUpperCase();
  return proto === 'WS' || proto === 'WSS';
}

/**
 * Determine the appropriate rtpengine bridge mode for a call.
 * - webrtc-to-sip:    IP Link (browser) → Zoiper / hardware phone
 * - webrtc-to-webrtc: IP Link → IP Link (both WebRTC)
 * - sip-to-sip:       traditional phone → traditional phone
 */
function detectBridgeMode(offerSdp: string, calleeUsername: string): BridgeMode {
  const callerIsWebRtc = isWebRtcSdp(offerSdp);

  const calleeReg = findRegistrationByUsername(calleeUsername)
    || getRegistration(`${calleeUsername}@${config.domain}`);

  const calleeIsWebRtc = calleeReg ? isWebRtcRegistration(calleeReg) : false;

  logger.debug({ calleeUsername, callerIsWebRtc, calleeIsWebRtc }, 'Bridge mode detection');

  if (callerIsWebRtc && !calleeIsWebRtc) return 'webrtc-to-sip';
  if (callerIsWebRtc && calleeIsWebRtc)  return 'webrtc-to-webrtc';
  return 'sip-to-sip';
}

export function handleInvite(request: any, remote: RemoteInfo): void {
  const callId = request.headers['call-id'];
  const fromTag = extractTag(request.headers.from);
  const callerUri = request.headers.from.uri;
  const callerParsed = typeof callerUri === 'string' ? sip.parseUri(callerUri) : callerUri;
  const callerUser = callerParsed?.user || 'unknown';

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

  // Detect bridge mode: WebRTC→plain-SIP, WebRTC→WebRTC, or SIP→SIP
  const mode = detectBridgeMode(sdp, callee.username);
  logger.info({ callId, mode, caller: callerUser, callee: callee.username }, 'Using bridge mode');

  logger.info({ callId, sdp }, 'Offer SDP from browser (before rtpengine)');

  rtpengine.offer(callId, fromTag, sdp, mode)
    .then((rewrittenSdp) => {
      logger.info({ callId, sdp: rewrittenSdp }, 'Offer SDP to callee (after rtpengine)');
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

          logger.info({ callId, sdp: answerSdp }, 'Answer SDP from callee (before rtpengine)');

          // Process answer SDP through rtpengine
          rtpengine.answer(callId, fromTag, toTag, answerSdp, mode)
            .then((rewrittenAnswerSdp) => {
              logger.info({ callId, sdp: rewrittenAnswerSdp }, 'Answer SDP to browser (after rtpengine)');
              // Extract callee's Contact URI from 200 OK for ACK forwarding.
              // RFC 3261 §13.2.2.4: ACK Request-URI is the Contact from 200 OK.
              const calleeContact = (response.headers.contact?.[0]?.uri
                || `sip:${callee.username}@${callee.host}:${callee.port}`);

              // Store active call
              activeCalls.set(callId, {
                callId,
                caller: callerUser,
                callee: callee.username,
                startedAt: Date.now(),
                callerTag: fromTag,
                calleeTag: toTag,
                calleeContactUri:  calleeContact,
                outboundCseqSeq:   request.headers.cseq.seq,
                callerFromHeader:  request.headers.from,
              });

              // Forward 200 OK to caller with rewritten SDP
              const okResponse = sip.makeResponse(request, 200, 'OK');
              okResponse.headers.to = response.headers.to;
              okResponse.headers.contact = [{ uri: `sip:${config.domain}:${config.sip.port}` }];
              okResponse.headers['content-type'] = 'application/sdp';
              okResponse.content = rewrittenAnswerSdp;
              sip.send(okResponse);

              logger.info({ callId, caller: callerUser, callee: callee.username, mode }, 'Call established');
            })
            .catch((err) => {
              logger.error({ err, callId }, 'rtpengine answer failed');
              sip.send(sip.makeResponse(request, 500, 'Server Internal Error'));
            });
          return;
        }

        // Forward error responses
        if (response.status >= 300) {
          logger.warn({ callId, status: response.status, reason: response.reason }, 'Call rejected by callee');
          const errorResponse = sip.makeResponse(request, response.status, response.reason);
          sip.send(errorResponse);

          // Clean up rtpengine session
          rtpengine.deleteSession(callId, fromTag).catch(() => {});
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

export function handleAck(request: any, _remote: RemoteInfo): void {
  const callId = request.headers['call-id'];
  const call = activeCalls.get(callId);

  // Only forward ACK if we have a stored B-leg for this call.
  // ACKs for non-2xx responses are handled hop-by-hop and don't need forwarding.
  if (!call || !call.calleeContactUri) {
    logger.debug({ callId }, 'ACK for unknown call or non-2xx — ignoring');
    return;
  }

  // RFC 3261 §13.2.2.4: In a B2BUA the server must send its own ACK on the
  // B-leg.  The browser ACK terminates the A-leg transaction; we originate a
  // fresh ACK toward Zoiper to terminate the B-leg transaction.
  const ackToCallee: any = {
    method: 'ACK',
    uri: call.calleeContactUri,
    headers: {
      to: {
        uri: call.calleeContactUri,
        params: { tag: call.calleeTag },
      },
      from:           call.callerFromHeader,
      'call-id':      callId,
      cseq:           { method: 'ACK', seq: call.outboundCseqSeq },
      'max-forwards': 70,
    },
    content: '',
  };

  sip.send(ackToCallee);
  logger.debug({ callId, callee: call.callee, uri: call.calleeContactUri }, 'ACK forwarded to callee');
}

export function getActiveCalls(): ActiveCall[] {
  return Array.from(activeCalls.values());
}
