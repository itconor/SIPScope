import type { Registration } from './types';
import logger from './logger';

const registrations = new Map<string, Registration>();

let expiryInterval: NodeJS.Timeout | null = null;

export function addRegistration(reg: Registration): void {
  registrations.set(reg.aor, reg);
  logger.info({ aor: reg.aor, contact: reg.contact, received: `${reg.receivedHost}:${reg.receivedPort}` }, 'Device registered');
}

export function removeRegistration(aor: string): void {
  if (registrations.has(aor)) {
    registrations.delete(aor);
    logger.info({ aor }, 'Device unregistered');
  }
}

export function getRegistration(aor: string): Registration | undefined {
  const reg = registrations.get(aor);
  if (reg && reg.expires < Date.now() / 1000) {
    registrations.delete(aor);
    logger.info({ aor }, 'Registration expired');
    return undefined;
  }
  return reg;
}

export function findRegistrationByUsername(username: string): Registration | undefined {
  for (const reg of registrations.values()) {
    if (reg.username === username) {
      if (reg.expires < Date.now() / 1000) {
        registrations.delete(reg.aor);
        return undefined;
      }
      return reg;
    }
  }
  return undefined;
}

export function getAllRegistrations(): Registration[] {
  const now = Date.now() / 1000;
  const active: Registration[] = [];
  for (const [aor, reg] of registrations) {
    if (reg.expires < now) {
      registrations.delete(aor);
    } else {
      active.push(reg);
    }
  }
  return active;
}

export function startExpiryTimer(): void {
  if (expiryInterval) return;
  expiryInterval = setInterval(() => {
    const now = Date.now() / 1000;
    for (const [aor, reg] of registrations) {
      if (reg.expires < now) {
        registrations.delete(aor);
        logger.info({ aor }, 'Registration expired (sweep)');
      }
    }
  }, 30_000);
}

export function stopExpiryTimer(): void {
  if (expiryInterval) {
    clearInterval(expiryInterval);
    expiryInterval = null;
  }
}
