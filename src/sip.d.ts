declare module './sip-patched' {
  export function start(options: any, callback: (request: any, remote: any) => void): void;
  export function stop(): void;
  export function send(message: any, callback?: (response: any, remote?: any) => void): void;
  export function makeResponse(request: any, status: number, reason?: string): any;
  export function parseUri(uri: string): { schema?: string; user?: string; host?: string; port?: number; params?: any };
  export function stringifyUri(uri: any): string;
  export function parseAOR(aor: string): any;
  export function copyMessage(msg: any, deep?: boolean): any;
  export function generateBranch(): string;
  export function parse(data: string | Buffer): any;
  export function stringify(message: any): string;
}

declare module 'sip' {
  export function start(options: any, callback: (request: any, remote: any) => void): void;
  export function stop(): void;
  export function send(message: any, callback?: (response: any, remote?: any) => void): void;
  export function makeResponse(request: any, status: number, reason?: string): any;
  export function parseUri(uri: string): { schema?: string; user?: string; host?: string; port?: number; params?: any };
  export function stringifyUri(uri: any): string;
  export function parseAOR(aor: string): any;
  export function copyMessage(msg: any, deep?: boolean): any;
  export function generateBranch(): string;
}

declare module 'sip/digest' {
  export function challenge(ctx: any, response: any): any;
  export function authenticateRequest(ctx: any, request: any, credentials: any): boolean;
  export function signResponse(ctx: any, response: any): any;
  export function signRequest(ctx: any, request: any, response: any, credentials: any): any;
  export function calculateUserRealmPasswordHash(user: string, realm: string, password: string): string;
  export function calculateHA1(ctx: any): string;
  export function calculateDigest(ctx: any): string;
  export function generateNonce(tag: string, timestamp?: Date): string;
  export function extractNonceTimestamp(nonce: string, tag: string): Date | undefined;
  export function kd(...args: string[]): string;
}

declare module 'sip/proxy' {
  export function start(options: any, route: (request: any, remote: any) => void): void;
  export function send(message: any, callback?: (response: any, remote?: any) => void): void;
  export function stop(): void;
}
