import { Router, type Request, type Response } from 'express';
import { getAllRegistrations } from '../../src/location-service';
import { getActiveCalls } from '../../src/call-handler';

const router = Router();

// GET /api/status - get live status
router.get('/', (_req: Request, res: Response) => {
  const registrations = getAllRegistrations().map((r) => ({
    username: r.username,
    aor: r.aor,
    contact: r.contact,
    ip: r.receivedHost,
    port: r.receivedPort,
    protocol: r.receivedProtocol,
    userAgent: r.userAgent,
    registeredAt: r.registeredAt,
    expiresIn: Math.max(0, r.expires - Math.floor(Date.now() / 1000)),
  }));

  const calls = getActiveCalls().map((c) => ({
    callId: c.callId,
    caller: c.caller,
    callee: c.callee,
    startedAt: c.startedAt,
    duration: Math.round((Date.now() - c.startedAt) / 1000),
  }));

  res.json({
    registrations,
    calls,
    uptime: Math.round(process.uptime()),
  });
});

export default router;
