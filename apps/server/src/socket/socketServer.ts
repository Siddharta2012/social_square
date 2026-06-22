import { Server } from 'socket.io';
import { env } from '../config/env';
import { redis } from '../config/redis';
import { logInfo, logWarn } from '../utils/logger';
import { socketConnected, socketDisconnected } from '../utils/metrics';
import { registerRoomHandlers } from './handlers/roomHandlers';
import { socketAuthMiddleware } from './middleware/socketAuth';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData,
} from '@social-square/shared';
import type { Server as HttpServer } from 'http';

export function createSocketServer(httpServer: HttpServer) {
  const io = new Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>(
    httpServer,
    {
      cors: {
        origin: env.CLIENT_URL,
        methods: ['GET', 'POST'],
      },
      transports: ['websocket', 'polling'],
    },
  );

  io.use(socketAuthMiddleware);
  installRedisAdapter(io);

  io.on('connection', async (socket) => {
    socketConnected();
    await socket.join(`user:${socket.data.userId}`);
    socket.once('disconnect', () => socketDisconnected());
    logInfo('socket.connected', { userId: socket.data.userId, username: socket.data.username, socketId: socket.id });
    registerRoomHandlers(io, socket);
  });

  return io;
}

function installRedisAdapter(io: ReturnType<typeof createSocketServer>): void {
  if (env.USE_REDIS_MOCK) return;
  try {
    // Optional until the dependency can be installed in environments with a
    // trusted registry CA. When present, this makes Socket.IO rooms cross-node.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createAdapter } = require('@socket.io/redis-adapter') as {
      createAdapter: (pubClient: unknown, subClient: unknown) => Parameters<typeof io.adapter>[0];
    };
    const subClient = (redis as import('ioredis').Redis).duplicate();
    void subClient.connect().catch((err: Error) => {
      logWarn('socket.redis_adapter_subscribe_failed', { message: err.message });
    });
    io.adapter(createAdapter(redis, subClient));
    logInfo('socket.redis_adapter.enabled', {});
  } catch (err) {
    logWarn('socket.redis_adapter_unavailable', {
      message: err instanceof Error ? err.message : String(err),
    });
  }
}
