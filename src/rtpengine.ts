import { loadServerConfig } from './config';
import logger from './logger';

const config = loadServerConfig();

// Use the battle-tested rtpengine-client instead of custom bencode
const Client = require('rtpengine-client').Client;
const client = new Client({
  host: config.rtpengine.host,
  port: config.rtpengine.port,
  timeout: 5000,
});

/**
 * Process the caller's offer SDP through rtpengine.
 *
 * Bridge modes:
 *   webrtc-to-sip  — caller is a WebRTC browser (DTLS-SRTP + ICE);
 *                    callee is a traditional SIP phone (plain RTP).
 *                    rtpengine terminates DTLS/ICE and produces a plain
 *                    RTP/AVP SDP for the callee.
 *
 *   webrtc-to-webrtc — both sides are WebRTC; rtpengine relays between
 *                      two DTLS-SRTP legs.
 *
 *   sip-to-sip     — both sides are plain SIP; standard relay.
 */
export type BridgeMode = 'webrtc-to-sip' | 'webrtc-to-webrtc' | 'sip-to-sip';

export async function offer(
  callId: string,
  fromTag: string,
  sdp: string,
  mode: BridgeMode = 'sip-to-sip',
): Promise<string> {
  logger.info({ callId, fromTag, sdpLength: sdp.length, mode }, 'Sending offer to rtpengine');

  let flags: Record<string, any>;

  if (mode === 'webrtc-to-sip') {
    // A-leg: WebRTC (DTLS-SRTP + ICE)
    // B-leg SDP produced for callee: plain RTP/AVP, no ICE, no DTLS
    flags = {
      'call-id':            callId,
      'from-tag':           fromTag,
      sdp,
      replace:              ['origin', 'session-connection'],
      // rtpengine terminates ICE and DTLS from the WebRTC caller
      ICE:                  'remove',        // strip ICE candidates from B-leg SDP
      DTLS:                 'passive',       // rtpengine handles DTLS toward caller
      // Rewrite transport so Zoiper/hardphones see plain RTP
      'transport-protocol': 'RTP/AVP',
      // Zoiper doesn't support rtcp-mux — demux RTCP into separate stream
      'rtcp-mux':           ['demux'],
      flags:                ['trust-address', 'SIP-source-address'],
    };
  } else if (mode === 'webrtc-to-webrtc') {
    // Both sides are WebRTC; rtpengine relays between two DTLS-SRTP legs.
    // ICE is handled end-to-end; we just relay the media.
    flags = {
      'call-id':  callId,
      'from-tag': fromTag,
      sdp,
      replace:    ['origin', 'session-connection'],
      ICE:        'force',     // rtpengine participates in ICE for A-leg
      DTLS:       'passive',
      flags:      ['trust-address'],
    };
  } else {
    // Plain SIP ↔ plain SIP
    flags = {
      'call-id':  callId,
      'from-tag': fromTag,
      sdp,
      replace:    ['origin', 'session-connection'],
      ICE:        'remove',
      'rtcp-mux': ['offer'],
    };
  }

  const result = await client.offer(config.rtpengine.port, config.rtpengine.host, flags);
  logger.info({ callId, result: result.result, hasSdp: !!result.sdp, mode }, 'rtpengine offer response');

  if (result.result !== 'ok') {
    throw new Error(result['error-reason'] || `rtpengine offer failed: ${result.result}`);
  }
  return result.sdp;
}

export async function answer(
  callId: string,
  fromTag: string,
  toTag: string,
  sdp: string,
  mode: BridgeMode = 'sip-to-sip',
): Promise<string> {
  logger.info({ callId, mode }, 'Sending answer to rtpengine');

  let flags: Record<string, any>;

  if (mode === 'webrtc-to-sip') {
    // B-leg answer comes from Zoiper (plain RTP/AVP).
    // rtpengine rewrites it to something the WebRTC caller can use.
    // The caller already negotiated DTLS/ICE in the offer phase;
    // rtpengine just needs to confirm its own addresses.
    flags = {
      'call-id':  callId,
      'from-tag': fromTag,
      'to-tag':   toTag,
      sdp,
      replace:    ['origin', 'session-connection'],
      ICE:        'remove',   // no ICE needed in the answer back to the caller
      DTLS:       'passive',
      flags:      ['trust-address'],
    };
  } else if (mode === 'webrtc-to-webrtc') {
    flags = {
      'call-id':  callId,
      'from-tag': fromTag,
      'to-tag':   toTag,
      sdp,
      replace:    ['origin', 'session-connection'],
      ICE:        'force',
      DTLS:       'passive',
      flags:      ['trust-address'],
    };
  } else {
    flags = {
      'call-id':  callId,
      'from-tag': fromTag,
      'to-tag':   toTag,
      sdp,
      replace:    ['origin', 'session-connection'],
      ICE:        'remove',
      'rtcp-mux': ['offer'],
    };
  }

  const result = await client.answer(config.rtpengine.port, config.rtpengine.host, flags);
  logger.debug({ callId, mode }, 'rtpengine answer processed');

  if (result.result !== 'ok') {
    throw new Error(result['error-reason'] || `rtpengine answer failed: ${result.result}`);
  }
  return result.sdp;
}

export async function deleteSession(callId: string, fromTag: string, toTag?: string): Promise<void> {
  const opts: Record<string, any> = {
    'call-id':  callId,
    'from-tag': fromTag,
  };
  if (toTag) opts['to-tag'] = toTag;

  await client.delete(config.rtpengine.port, config.rtpengine.host, opts);
  logger.debug({ callId }, 'rtpengine session deleted');
}

export function close(): void {
  // rtpengine-client handles cleanup internally
}
