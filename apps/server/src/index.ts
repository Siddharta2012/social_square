import express from 'express';
import { createServer } from 'http';
import path from 'path';
import cors from 'cors';
import { createSocketServer } from './socket/socketServer';
import { redis } from './config/redis';
import { authRouter } from './api/routes/auth';
import { voiceRouter } from './api/routes/voice';

const PORT = process.env.PORT ?? 3000;

const app = express();
// In production the client is served from this same server (same origin),
// so CORS is only needed in dev. Allow CLIENT_URL or fall back to permissive.
app.use(cors({ origin: process.env.CLIENT_URL ?? (process.env.NODE_ENV === 'production' ? false : 'http://localhost:5173') }));
app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
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
    console.warn('[Redis] Initial connection failed:', err.message);
  });
}

httpServer.listen(PORT, () => {
  console.log(`[Server] Running on http://localhost:${PORT}`);
  console.log(`[Server] Health: http://localhost:${PORT}/api/health`);
});
