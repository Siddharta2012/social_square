import { Server } from 'socket.io';
import type { Server as HttpServer } from 'http';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData,
} from '@social-square/shared';
import { socketAuthMiddleware } from './middleware/socketAuth';
import { registerRoomHandlers } from './handlers/roomHandlers';
import { logInfo } from '../utils/logger';

export function createSocketServer(httpServer: HttpServer) {
  const io = new Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>(
    httpServer,
    {
      cors: {
        origin: process.env.CLIENT_URL ?? 'http://localhost:5173',
        methods: ['GET', 'POST'],
      },
      transports: ['websocket', 'polling'],
    },
  );

  io.use(socketAuthMiddleware);

  io.on('connection', (socket) => {
    logInfo('socket.connected', { userId: socket.data.userId, username: socket.data.username, socketId: socket.id });
    registerRoomHandlers(io, socket);
  });

  return io;
}
