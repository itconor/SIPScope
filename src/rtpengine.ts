import dgram from 'dgram';
import { loadServerConfig } from './config';
import logger from './logger';

const config = loadServerConfig();

let socket: dgram.Socket | null = null;
let cookie = 0;
const pending = new Map<string, { resolve: (v: any) => void; reject: (e: Error) => void }>();

function ensureSocket(): dgram.Socket {
  if (socket) return socket;

  socket = dgram.createSocket('udp4');
  socket.on('message', (msg) => {
    const str = msg.toString();
    const spaceIdx = str.indexOf(' ');
    if (spaceIdx === -1) return;

    const cookieStr = str.substring(0, spaceIdx);
    const body = str.substring(spaceIdx + 1);

    const p = pending.get(cookieStr);
    if (p) {
      pending.delete(cookieStr);
      try {
        const parsed = parseBencode(body);
        if (parsed.result === 'error') {
          p.reject(new Error(parsed['error-reason'] || 'rtpengine error'));
        } else {
          p.resolve(parsed);
        }
      } catch (e) {
        p.reject(e as Error);
      }
    }
  });

  socket.on('error', (err) => {
    logger.error({ err }, 'rtpengine socket error');
  });

  return socket;
}

function sendCommand(command: Record<string, any>): Promise<any> {
  const sock = ensureSocket();
  const c = String(++cookie);

  const encoded = encodeBencode(command);
  const message = `${c} ${encoded}`;

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(c);
      reject(new Error('rtpengine command timeout'));
    }, 5000);

    pending.set(c, {
      resolve: (v) => { clearTimeout(timer); resolve(v); },
      reject: (e) => { clearTimeout(timer); reject(e); },
    });

    sock.send(message, config.rtpengine.port, config.rtpengine.host, (err) => {
      if (err) {
        pending.delete(c);
        clearTimeout(timer);
        reject(err);
      }
    });
  });
}

// Simple bencode encoder/decoder for rtpengine ng protocol
function encodeBencode(obj: any): string {
  if (typeof obj === 'string') {
    return `${obj.length}:${obj}`;
  }
  if (typeof obj === 'number') {
    return `i${obj}e`;
  }
  if (Array.isArray(obj)) {
    return 'l' + obj.map(encodeBencode).join('') + 'e';
  }
  if (typeof obj === 'object' && obj !== null) {
    let result = 'd';
    const keys = Object.keys(obj).sort();
    for (const key of keys) {
      result += encodeBencode(key) + encodeBencode(obj[key]);
    }
    return result + 'e';
  }
  return '';
}

function parseBencode(str: string): any {
  let pos = 0;

  function parse(): any {
    const ch = str[pos];
    if (ch === 'i') {
      pos++;
      const end = str.indexOf('e', pos);
      const num = parseInt(str.substring(pos, end), 10);
      pos = end + 1;
      return num;
    }
    if (ch === 'l') {
      pos++;
      const list: any[] = [];
      while (str[pos] !== 'e') list.push(parse());
      pos++;
      return list;
    }
    if (ch === 'd') {
      pos++;
      const dict: Record<string, any> = {};
      while (str[pos] !== 'e') {
        const key = parse();
        dict[key] = parse();
      }
      pos++;
      return dict;
    }
    // String: length:value
    const colonIdx = str.indexOf(':', pos);
    const len = parseInt(str.substring(pos, colonIdx), 10);
    pos = colonIdx + 1;
    const val = str.substring(pos, pos + len);
    pos += len;
    return val;
  }

  return parse();
}

export async function offer(callId: string, fromTag: string, sdp: string): Promise<string> {
  const result = await sendCommand({
    command: 'offer',
    'call-id': callId,
    'from-tag': fromTag,
    sdp,
    replace: ['origin', 'session-connection'],
    ICE: 'remove',
    direction: ['external', 'external'],
    'rtcp-mux': ['offer'],
  });
  logger.debug({ callId }, 'rtpengine offer processed');
  return result.sdp;
}

export async function answer(callId: string, fromTag: string, toTag: string, sdp: string): Promise<string> {
  const result = await sendCommand({
    command: 'answer',
    'call-id': callId,
    'from-tag': fromTag,
    'to-tag': toTag,
    sdp,
    replace: ['origin', 'session-connection'],
    ICE: 'remove',
    direction: ['external', 'external'],
    'rtcp-mux': ['offer'],
  });
  logger.debug({ callId }, 'rtpengine answer processed');
  return result.sdp;
}

export async function deleteSession(callId: string, fromTag: string, toTag?: string): Promise<void> {
  const cmd: Record<string, any> = {
    command: 'delete',
    'call-id': callId,
    'from-tag': fromTag,
  };
  if (toTag) cmd['to-tag'] = toTag;

  await sendCommand(cmd);
  logger.debug({ callId }, 'rtpengine session deleted');
}

export function close(): void {
  if (socket) {
    socket.close();
    socket = null;
  }
}
