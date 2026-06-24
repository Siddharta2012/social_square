import { createServer } from 'http';
import path from 'path';
import cors from 'cors';
import express from 'express';
import { authRouter } from './api/routes/auth';
import { moderationRouter } from './api/routes/moderation';
import { privateRoomsRouter } from './api/routes/privateRooms';
import { shopRouter } from './api/routes/shop';
import { socialRouter } from './api/routes/social';
import { voiceRouter } from './api/routes/voice';
import { databaseReady } from './config/database';
import { env } from './config/env';
import { redis } from './config/redis';
import { isLiveKitConfigured } from './services/VoiceService';
import { createSocketServer } from './socket/socketServer';
import { installGlobalErrorHandlers } from './utils/errorReporter';
import { requireAdmin, securityHeaders } from './utils/httpSecurity';
import { logError, logInfo, logWarn } from './utils/logger';
import { metricsSnapshot } from './utils/metrics';

installGlobalErrorHandlers();

const app = express();
app.set('trust proxy', 1);
app.use(securityHeaders);
// In production the client is served from this same server (same origin),
// so CORS is only needed in dev. Allow CLIENT_URL or fall back to permissive.
app.use(cors({ origin: env.NODE_ENV === 'production' ? false : env.CLIENT_URL }));
app.use(express.json({ limit: '64kb' }));

async function redisReady(): Promise<{ ok: boolean; error?: string }> {
  let redisOk = false;
  let redisError: string | undefined;
  try {
    const pong = await redis.ping();
    redisOk = pong === 'PONG' || pong === 'OK';
  } catch (err) {
    redisError = err instanceof Error ? err.message : String(err);
  }

  return { ok: redisOk, error: redisError };
}

app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: env.NODE_ENV,
  });
});

app.get('/api/ready', async (_req, res) => {
  const [redisCheck, databaseCheck] = await Promise.all([redisReady(), databaseReady()]);
  const checks = {
    redis: redisCheck.ok,
    database: databaseCheck.ok,
    livekit: isLiveKitConfigured(),
    google: env.GOOGLE_ENABLED,
    jwt: Boolean(env.JWT_SECRET),
  };
  const ok = checks.redis && checks.database && checks.jwt;
  res.status(ok ? 200 : 503).json({
    status: ok ? 'ok' : 'degraded',
    timestamp: new Date().toISOString(),
    environment: env.NODE_ENV,
    checks,
    redisError: redisCheck.error,
    databaseError: databaseCheck.error,
    databaseSkipped: databaseCheck.skipped,
  });
});

app.use('/api/auth', authRouter);
app.use('/api/moderation', moderationRouter);
app.use('/api/private-rooms', privateRoomsRouter);
app.use('/api/shop', shopRouter);
app.use('/api/social', socialRouter);
app.use('/api/voice', voiceRouter);

app.get('/api/rooms', (_req, res) => {
  res.json([
    { id: 'mall', name: 'Centro Commerciale', currentUsers: 0, maxUsers: 30 },
    { id: 'bar', name: 'Bar', currentUsers: 0, maxUsers: 20 },
    { id: 'park', name: 'Picnic al Parco', currentUsers: 0, maxUsers: 25 },
    { id: 'lake', name: 'Pesca al Lago', currentUsers: 0, maxUsers: 20 },
  ]);
});

app.get('/metrics', requireAdmin, (_req, res) => {
  res.json({
    timestamp: new Date().toISOString(),
    ...metricsSnapshot(),
  });
});

app.get('/api/admin/debug', requireAdmin, async (_req, res) => {
  if (env.NODE_ENV === 'production') {
    res.status(404).json({ error: 'NOT_FOUND' });
    return;
  }

  const [redisCheck, databaseCheck] = await Promise.all([redisReady(), databaseReady()]);

  res.json({
    environment: env.NODE_ENV,
    redisMock: env.USE_REDIS_MOCK,
    redisOk: redisCheck.ok,
    databaseOk: databaseCheck.ok,
    databaseSkipped: databaseCheck.skipped,
    livekitConfigured: isLiveKitConfigured(),
    googleConfigured: env.GOOGLE_ENABLED,
    clientUrl: env.CLIENT_URL,
  });
});

app.get('/admin/debug', requireAdmin, (_req, res) => {
  if (env.NODE_ENV === 'production') {
    res.status(404).send('Not found');
    return;
  }

  res.type('html').send(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Social Square Debug</title>
    <style>
      body { margin: 0; padding: 24px; background: #080a18; color: #e0e0ff; font-family: monospace; }
      pre { white-space: pre-wrap; background: #10142b; border: 1px solid #343a75; border-radius: 6px; padding: 14px; }
    </style>
  </head>
  <body>
    <h1>Social Square Debug</h1>
    <pre id="debug">Loading...</pre>
    <script>
      fetch('/api/admin/debug')
        .then((res) => res.json())
        .then((data) => { document.getElementById('debug').textContent = JSON.stringify(data, null, 2); })
        .catch((err) => { document.getElementById('debug').textContent = String(err); });
    </script>
  </body>
</html>`);
});

// Serve the built client in production
if (env.NODE_ENV === 'production') {
  const clientDist = path.join(__dirname, '../../client/dist');
  app.use(express.static(clientDist));
  // SPA fallback — all non-API routes serve index.html
  app.get('*', (_req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

const httpServer = createServer(app);
createSocketServer(httpServer);

// Connect to Redis only if not using the in-memory mock
if (!env.USE_REDIS_MOCK) {
  (redis as import('ioredis').Redis).connect?.().catch((err: Error) => {
    logWarn('redis.initial_connection_failed', { message: err.message });
  });
}

// Surface listen failures loudly — without this handler a bind error (e.g. the
// wrong port) crashes the process with no log, which looks like a silent hang.
httpServer.on('error', (err: NodeJS.ErrnoException) => {
  logError('server.listen_failed', { port: env.PORT, code: err.code, message: err.message });
  process.exit(1);
});

// Bind to 0.0.0.0 explicitly: Railway's healthcheck reaches the container over
// IPv4, but Node's default listen binds to the IPv6 wildcard (::), which can be
// unreachable and make /api/health time out even though the server is "up".
httpServer.listen(env.PORT, '0.0.0.0', () => {
  logInfo('server.started', { port: env.PORT, host: '0.0.0.0' });
});
