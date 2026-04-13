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
 *
 *   sip-to-webrtc  — caller is a traditional SIP phone (plain RTP);
 *                    callee is a WebRTC client (DTLS-SRTP + ICE).
 *                    rtpengine adds ICE/DTLS to the offer for the WebRTC
 *                    callee, and strips it from the answer back to the caller.
 */
export type BridgeMode = 'webrtc-to-sip' | 'webrtc-to-webrtc' | 'sip-to-sip' | 'sip-to-webrtc';

export async function offer(
  callId: string,
  fromTag: string,
  sdp: string,
  mode: BridgeMode = 'sip-to-sip',
): Promise<string> {
  logger.info({ callId, fromTag, sdpLength: sdp.length, mode }, 'Sending offer to rtpengine');

  let flags: Record<string, any>;

  if (mode === 'webrtc-to-sip') {
    // A-leg offer: plain RTP/AVP SDP sent to the SIP callee (Zoiper).
    // Strip ICE and DTLS entirely — plain SIP clients don't speak WebRTC.
    flags = {
      'call-id':            callId,
      'from-tag':           fromTag,
      sdp,
      replace:              ['origin', 'session-connection'],
      ICE:                  'remove',
      'transport protocol': 'RTP/AVP',
      'rtcp-mux':           ['demux'],
    };
  } else if (mode === 'webrtc-to-webrtc') {
    flags = {
      'call-id':  callId,
      'from-tag': fromTag,
      sdp,
      replace:    ['origin', 'session-connection'],
      ICE:        'force',
      DTLS:       'passive',
    };
  } else if (mode === 'sip-to-webrtc') {
    // A-leg offer: plain SIP/RTP caller → add ICE + DTLS so WebRTC callee can answer
    flags = {
      'call-id':            callId,
      'from-tag':           fromTag,
      sdp,
      replace:              ['origin', 'session-connection'],
      ICE:                  'force',
      'transport protocol': 'UDP/TLS/RTP/SAVPF',
      'rtcp-mux':           ['require'],
      DTLS:                 'passive',
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

  logger.debug({ callId, flags }, 'rtpengine offer flags');
  const result = await client.offer(config.rtpengine.port, config.rtpengine.host, flags);
  logger.info({ callId, result: result.result, hasSdp: !!result.sdp, mode, errorReason: result['error-reason'] }, 'rtpengine offer response');

  if (result.result !== 'ok') {
    throw new Error(`rtpengine offer failed [${result.result}]: ${result['error-reason'] || '(no reason given)'}`);
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
    // B-leg answer: Zoiper's plain RTP/AVP answer arrives here.
    // rtpengine rewrites this into a WebRTC SDP for the browser:
    //   - transport protocol: UDP/TLS/RTP/SAVPF (browser requires this)
    //   - ICE candidates for rtpengine's relay port
    //   - rtcp-mux required (WebRTC mandates it)
    // rtpengine handles the DTLS negotiation toward the browser automatically
    // based on the transport protocol — no explicit DTLS flag needed.
    flags = {
      'call-id':            callId,
      'from-tag':           fromTag,
      'to-tag':             toTag,
      sdp,
      replace:              ['origin', 'session-connection'],
      ICE:                  'force',
      'transport protocol': 'UDP/TLS/RTP/SAVPF',
      'rtcp-mux':           ['require'],
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
    };
  } else if (mode === 'sip-to-webrtc') {
    // B-leg answer: WebRTC callee answered → strip ICE/DTLS → plain RTP for SIP caller
    flags = {
      'call-id':            callId,
      'from-tag':           fromTag,
      'to-tag':             toTag,
      sdp,
      replace:              ['origin', 'session-connection'],
      ICE:                  'remove',
      'transport protocol': 'RTP/AVP',
      'rtcp-mux':           ['demux'],
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
  logger.info({ callId, result: result.result, mode, errorReason: result['error-reason'] }, 'rtpengine answer response');

  if (result.result !== 'ok') {
    throw new Error(`rtpengine answer failed [${result.result}]: ${result['error-reason'] || '(no reason given)'}`);
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
