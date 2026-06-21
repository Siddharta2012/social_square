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
    console.log(`[Socket] Connected: ${socket.data.username} (${socket.id})`);
    registerRoomHandlers(io, socket);
  });

  return io;
}
