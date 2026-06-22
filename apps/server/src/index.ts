import express from 'express';
import { createServer } from 'http';
import path from 'path';
import cors from 'cors';
import { createSocketServer } from './socket/socketServer';
import { redis } from './config/redis';
import { authRouter } from './api/routes/auth';
import { voiceRouter } from './api/routes/voice';
import { isLiveKitConfigured } from './services/VoiceService';
import { logInfo, logWarn } from './utils/logger';

const PORT = process.env.PORT ?? 3000;

const app = express();
app.set('trust proxy', 1);
// In production the client is served from this same server (same origin),
// so CORS is only needed in dev. Allow CLIENT_URL or fall back to permissive.
app.use(cors({ origin: process.env.CLIENT_URL ?? (process.env.NODE_ENV === 'production' ? false : 'http://localhost:5173') }));
app.use(express.json());

app.get('/api/health', async (_req, res) => {
  let redisOk = false;
  let redisError: string | undefined;
  try {
    const pong = await redis.ping();
    redisOk = pong === 'PONG' || pong === 'OK';
  } catch (err) {
    redisError = err instanceof Error ? err.message : String(err);
  }

  const googleConfigured = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REDIRECT_URI);
  const checks = {
    redis: redisOk,
    livekit: isLiveKitConfigured(),
    google: googleConfigured,
    jwt: Boolean(process.env.JWT_SECRET),
  };
  const ok = checks.redis && checks.jwt;
  res.status(ok ? 200 : 503).json({
    status: ok ? 'ok' : 'degraded',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV ?? 'development',
    checks,
    redisError,
  });
});

app.use('/api/auth', authRouter);
app.use('/api/voice', voiceRouter);

app.get('/api/rooms', (_req, res) => {
  res.json([
    { id: 'mall', name: 'Centro Commerciale', currentUsers: 0, maxUsers: 30 },
    { id: 'bar', name: 'Bar', currentUsers: 0, maxUsers: 20 },
    { id: 'park', name: 'Picnic al Parco', currentUsers: 0, maxUsers: 25 },
    { id: 'lake', name: 'Pesca al Lago', currentUsers: 0, maxUsers: 20 },
  ]);
});

app.get('/api/admin/debug', async (_req, res) => {
  if (process.env.NODE_ENV === 'production') {
    res.status(404).json({ error: 'NOT_FOUND' });
    return;
  }

  let redisOk = false;
  try {
    redisOk = Boolean(await redis.ping());
  } catch {
    redisOk = false;
  }

  res.json({
    environment: process.env.NODE_ENV ?? 'development',
    redisMock: process.env.REDIS_MOCK === 'true' || !process.env.REDIS_URL,
    redisOk,
    livekitConfigured: isLiveKitConfigured(),
    googleConfigured: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REDIRECT_URI),
    clientUrl: process.env.CLIENT_URL ?? null,
  });
});

app.get('/admin/debug', (_req, res) => {
  if (process.env.NODE_ENV === 'production') {
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
if (process.env.NODE_ENV === 'production') {
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
if (process.env.REDIS_MOCK !== 'true') {
  (redis as import('ioredis').Redis).connect?.().catch((err: Error) => {
    logWarn('redis.initial_connection_failed', { message: err.message });
  });
}

httpServer.listen(PORT, () => {
  logInfo('server.started', { port: PORT, healthUrl: `http://localhost:${PORT}/api/health` });
});
