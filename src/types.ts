export interface SipMessage {
  method?: string;
  status?: number;
  reason?: string;
  uri?: string;
  version?: string;
  headers: Record<string, any>;
  content?: string;
}

export interface SipRequest extends SipMessage {
  method: string;
  uri: string;
}

export interface SipResponse extends SipMessage {
  status: number;
  reason: string;
}

export interface RemoteInfo {
  address: string;
  port: number;
  protocol: string;
}

export interface Registration {
  aor: string;
  username: string;
  contact: string;
  receivedHost: string;
  receivedPort: number;
  receivedProtocol: string;
  expires: number;
  callId: string;
  cSeq: number;
  userAgent: string;
  registeredAt: number;
}

export interface SipAccount {
  username: string;
  ha1: string;
  realm: string;
  displayName?: string;
}

export interface ActiveCall {
  callId: string;
  caller: string;
  callee: string;
  startedAt: number;
  callerTag: string;
  calleeTag: string;
  rtpengineCallId?: string;
}

export interface ServerConfig {
  domain: string;
  publicIp: string;
  sip: {
    port: number;
    tlsPort: number;
    wsPort: number;
  };
  rtpengine: {
    host: string;
    port: number;
  };
  web: {
    port: number;
    adminUser: string;
    adminPassword: string;
    sessionSecret: string;
  };
  registrationExpiry: number;
  realm: string;
  logLevel: string;
}
