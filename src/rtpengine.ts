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
    // B-leg SDP produced for callee: plain RTP/AVP, no ICE, no DTLS.
    // NOTE: rtpengine NG protocol uses spaces in parameter names, not hyphens.
    flags = {
      'call-id':            callId,
      'from-tag':           fromTag,
      sdp,
      replace:              ['origin', 'session-connection'],
      ICE:                  'remove',    // strip ICE from B-leg SDP
      DTLS:                 'passive',   // rtpengine terminates DTLS toward browser
      // 'transport protocol' (space) is the correct rtpengine NG parameter name
      'transport protocol': 'RTP/AVP',
      'rtcp-mux':           ['demux'],   // split rtcp-mux for non-WebRTC callee
      SDES:                 ['off'],     // no SDES — browsers only support DTLS
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
    // B-leg answer is from Zoiper (plain RTP/AVP).
    // The SDP produced by rtpengine here goes back to the WebRTC browser as
    // the 200 OK answer.  It MUST be a full WebRTC SDP:
    //   - transport protocol: UDP/TLS/RTP/SAVPF  (browser rejects anything else)
    //   - DTLS fingerprint + a=setup:passive  (rtpengine waits, browser initiates)
    //   - ICE candidates for rtpengine's relay port  (browser uses these for media)
    //   - rtcp-mux (WebRTC requires it)
    //   - SDES off (browsers don't support SDES, only DTLS)
    // Without 'transport protocol', rtpengine leaves the m= line as RTP/AVP and
    // the browser sends plain RTP.  rtpengine then tries to output SRTP but has
    // no crypto keys → "SRTP output wanted, but no crypto suite was negotiated".
    flags = {
      'call-id':            callId,
      'from-tag':           fromTag,
      'to-tag':             toTag,
      sdp,
      replace:              ['origin', 'session-connection'],
      // ICE:'lite' makes rtpengine an ICE-lite endpoint — it responds to the
      // browser's STUN binding requests so ICE connectivity actually completes.
      // ICE:'force' only adds candidates to the SDP without handling STUN,
      // so the browser's ICE stays in "checking" and DTLS never starts.
      ICE:                  'lite',
      DTLS:                 'passive',
      'transport protocol': 'UDP/TLS/RTP/SAVPF',
      'rtcp-mux':           ['require'],
      SDES:                 ['off'],
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
