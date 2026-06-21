import type { Server, Socket } from 'socket.io';
import { randomUUID } from 'node:crypto';
import {
  Direction,
  ROOM_CONFIGS,
  isJukeboxTrackId,
  nextJukeboxTrackId,
  normalizeChatText,
  normalizeJukeboxState,
} from '@social-square/shared';
import type {
  AvatarState,
  ClientToServerEvents,
  EmoteId,
  InterServerEvents,
  ObjectState,
  ServerToClientEvents,
  SocketData,
  AvatarConfig,
  Position,
} from '@social-square/shared';
import { StateService } from '../../services/StateService';

type IoServer = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
type IoSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;

const state = new StateService();
const EMOTE_IDS = new Set<EmoteId>(['wave', 'dance', 'clap']);
const SEAT_PREFIX = 'seat:';

function numberFromState(value: ObjectState | undefined, key: string): number | null {
  const raw = value?.[key];
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : null;
}

function seatPositionFrom(value: ObjectState | undefined): Position | null {
  const x = numberFromState(value, 'x');
  const y = numberFromState(value, 'y');
  return x === null || y === null ? null : { x, y };
}

function isEmoteId(value: unknown): value is EmoteId {
  return typeof value === 'string' && EMOTE_IDS.has(value as EmoteId);
}

export function registerRoomHandlers(io: IoServer, socket: IoSocket): void {
  const { userId, username } = socket.data;

  async function leaveCurrentRoom(): Promise<void> {
    const roomId = socket.data.currentRoom;
    if (!roomId) return;
    const clearedObjects = await state.clearObjectOccupancy(roomId, userId);
    await socket.leave(roomId);
    socket.data.currentRoom = undefined;
    await state.removeUser(roomId, userId);
    socket.to(roomId).emit('user-left', { userId });
    for (const object of clearedObjects) {
      io.to(roomId).emit('object-state-changed', object);
    }
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

    await state.updatePose(roomId, userId, { x, y }, moveState);
    socket.to(roomId).emit('user-moved', { userId, x, y, direction, state: moveState });
  });

  socket.on('interact', async ({ objectId, action, payload }) => {
    const roomId = socket.data.currentRoom;
    if (!roomId) return;

    if (objectId === 'jukebox') {
      const now = Date.now();
      const current = normalizeJukeboxState(await state.getObjectState(roomId, objectId), now);
      let next = current;

      if (action === 'jukebox-toggle') {
        next = {
          ...current,
          playing: !current.playing,
          startedAt: current.playing ? null : now,
          updatedAt: now,
          requestedBy: username,
        };
      } else if (action === 'jukebox-next') {
        next = {
          ...current,
          trackId: nextJukeboxTrackId(current.trackId),
          playing: true,
          startedAt: now,
          updatedAt: now,
          requestedBy: username,
        };
      } else if (action === 'jukebox-play-track') {
        const trackId = isJukeboxTrackId(payload?.trackId)
          ? payload.trackId
          : current.trackId;
        next = {
          ...current,
          trackId,
          playing: true,
          startedAt: now,
          updatedAt: now,
          requestedBy: username,
        };
      } else if (action === 'jukebox-stop') {
        next = {
          ...current,
          playing: false,
          startedAt: null,
          updatedAt: now,
          requestedBy: username,
        };
      } else {
        socket.emit('error', { code: 'UNKNOWN_INTERACTION', message: 'Azione jukebox sconosciuta' });
        return;
      }

      await state.updateObjectState(roomId, objectId, next as unknown as ObjectState);
      io.to(roomId).emit('object-state-changed', { objectId, state: next as unknown as ObjectState });
      return;
    }

    if (objectId.startsWith(SEAT_PREFIX)) {
      const current = await state.getObjectState(roomId, objectId) ?? {};
      const occupiedBy = typeof current.occupiedBy === 'string' ? current.occupiedBy : null;
      const now = Date.now();

      if (action === 'seat-sit') {
        if (occupiedBy && occupiedBy !== userId) {
          socket.emit('error', { code: 'SEAT_OCCUPIED', message: 'Seduta occupata' });
          return;
        }

        const position = seatPositionFrom(payload);
        if (!position) {
          socket.emit('error', { code: 'INVALID_SEAT', message: 'Seduta non valida' });
          return;
        }

        const next: ObjectState = {
          kind: 'seat',
          occupiedBy: userId,
          x: position.x,
          y: position.y,
          updatedAt: now,
        };

        await state.updateObjectState(roomId, objectId, next);
        await state.updatePose(roomId, userId, position, 'sit');
        io.to(roomId).emit('object-state-changed', { objectId, state: next });
        io.to(roomId).emit('user-moved', {
          userId,
          x: position.x,
          y: position.y,
          direction: Direction.SE,
          state: 'sit' as AvatarState,
        });
        return;
      }

      if (action === 'seat-leave') {
        if (occupiedBy && occupiedBy !== userId) return;

        const position = seatPositionFrom(payload) ?? seatPositionFrom(current);
        const next: ObjectState = {
          ...current,
          kind: 'seat',
          occupiedBy: null,
          updatedAt: now,
        };

        await state.updateObjectState(roomId, objectId, next);
        if (position) {
          await state.updatePose(roomId, userId, position, 'idle');
          io.to(roomId).emit('user-moved', {
            userId,
            x: position.x,
            y: position.y,
            direction: Direction.SE,
            state: 'idle' as AvatarState,
          });
        } else {
          await state.updateAvatarState(roomId, userId, 'idle');
        }
        io.to(roomId).emit('object-state-changed', { objectId, state: next });
        return;
      }

      socket.emit('error', { code: 'UNKNOWN_INTERACTION', message: 'Azione seduta sconosciuta' });
      return;
    }

    socket.emit('error', { code: 'UNKNOWN_INTERACTION', message: 'Oggetto sconosciuto' });
  });

  socket.on('emote', ({ emoteId }) => {
    const roomId = socket.data.currentRoom;
    if (!roomId || !isEmoteId(emoteId)) return;
    socket.to(roomId).emit('user-emote', { userId, emoteId });
  });

  socket.on('chat-message', ({ text }) => {
    const roomId = socket.data.currentRoom;
    if (!roomId) return;

    const normalized = normalizeChatText(text);
    if (!normalized) return;

    io.to(roomId).emit('user-chat-message', {
      id: randomUUID(),
      roomId,
      userId,
      username,
      text: normalized,
      sentAt: Date.now(),
    });
  });

  socket.on('hold-item', async ({ item }) => {
    const roomId = socket.data.currentRoom;
    if (!roomId) return;

    await state.updateHeldItem(roomId, userId, item);
    socket.to(roomId).emit('user-held-item', { userId, item });
  });

  socket.on('disconnect', async () => {
    await leaveCurrentRoom();
    console.log(`[Socket] Disconnected: ${username} (${socket.id})`);
  });
}
