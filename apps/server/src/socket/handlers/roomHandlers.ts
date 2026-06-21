import type { Server, Socket } from 'socket.io';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData,
  AvatarConfig,
  Position,
} from '@social-square/shared';
import { ROOM_CONFIGS } from '@social-square/shared';
import { StateService } from '../../services/StateService';

type IoServer = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
type IoSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;

const state = new StateService();

export function registerRoomHandlers(io: IoServer, socket: IoSocket): void {
  const { userId, username } = socket.data;

  async function leaveCurrentRoom(): Promise<void> {
    const roomId = socket.data.currentRoom;
    if (!roomId) return;
    await socket.leave(roomId);
    socket.data.currentRoom = undefined;
    await state.removeUser(roomId, userId);
    socket.to(roomId).emit('user-left', { userId });
    const count = await state.getUserCount(roomId);
    io.emit('room-users-count', { roomId, count });
  }

  socket.on('join-room', async ({ roomId, avatarConfig }) => {
    const roomConfig = ROOM_CONFIGS[roomId];
    if (!roomConfig) {
      socket.emit('error', { code: 'ROOM_NOT_FOUND', message: 'Stanza non trovata' });
      return;
    }

    await leaveCurrentRoom();

    // Pick spawn point cycling through available slots
    const currentCount = await state.getUserCount(roomId);
    const spawnPoints = roomConfig.spawnPoints;
    const spawn: Position = spawnPoints[currentCount % spawnPoints.length];

    const userState = {
      userId,
      username,
      avatarConfig: { ...avatarConfig, userId, username } as AvatarConfig,
      position: spawn,
      state: 'idle' as const,
    };

    await socket.join(roomId);
    socket.data.currentRoom = roomId;
    await state.addUser(roomId, userState);

    // Send full room state only to the joining client
    const roomState = await state.getRoomState(roomId);
    socket.emit('room-state', roomState);

    // Notify everyone else
    socket.to(roomId).emit('user-joined', {
      userId,
      avatarConfig: userState.avatarConfig,
      position: spawn,
    });

    const newCount = await state.getUserCount(roomId);
    io.emit('room-users-count', { roomId, count: newCount });

    console.log(`[Room] ${username} joined ${roomId} (${newCount} users)`);
  });

  socket.on('leave-room', async () => {
    await leaveCurrentRoom();
  });

  socket.on('move', async ({ x, y, direction, state: moveState }) => {
    const roomId = socket.data.currentRoom;
    if (!roomId) return;

    await state.updatePosition(roomId, userId, { x, y });
    socket.to(roomId).emit('user-moved', { userId, x, y, direction, state: moveState });
  });

  socket.on('disconnect', async () => {
    await leaveCurrentRoom();
    console.log(`[Socket] Disconnected: ${username} (${socket.id})`);
  });
}
