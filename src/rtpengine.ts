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

export async function offer(callId: string, fromTag: string, sdp: string): Promise<string> {
  logger.info({ callId, fromTag, sdpLength: sdp.length }, 'Sending offer to rtpengine');
  const result = await client.offer(config.rtpengine.port, config.rtpengine.host, {
    'call-id': callId,
    'from-tag': fromTag,
    sdp,
    replace: ['origin', 'session-connection'],
    ICE: 'remove',
    'rtcp-mux': ['offer'],
  });
  logger.info({ callId, result: result.result, hasSdp: !!result.sdp }, 'rtpengine offer response');
  if (result.result !== 'ok') {
    throw new Error(result['error-reason'] || `rtpengine offer failed: ${result.result}`);
  }
  return result.sdp;
}

export async function answer(callId: string, fromTag: string, toTag: string, sdp: string): Promise<string> {
  const result = await client.answer(config.rtpengine.port, config.rtpengine.host, {
    'call-id': callId,
    'from-tag': fromTag,
    'to-tag': toTag,
    sdp,
    replace: ['origin', 'session-connection'],
    ICE: 'remove',
    'rtcp-mux': ['offer'],
  });
  logger.debug({ callId }, 'rtpengine answer processed');
  if (result.result !== 'ok') {
    throw new Error(result['error-reason'] || `rtpengine answer failed: ${result.result}`);
  }
  return result.sdp;
}

export async function deleteSession(callId: string, fromTag: string, toTag?: string): Promise<void> {
  const opts: Record<string, any> = {
    'call-id': callId,
    'from-tag': fromTag,
  };
  if (toTag) opts['to-tag'] = toTag;

  await client.delete(config.rtpengine.port, config.rtpengine.host, opts);
  logger.debug({ callId }, 'rtpengine session deleted');
}

export function close(): void {
  // rtpengine-client handles cleanup internally
}
