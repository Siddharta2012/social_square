import { randomUUID } from 'node:crypto';
import {
  BAR_SERVICE_OBJECT_ID,
  JUKEBOX_OBJECT_ID,
  PETAL_BLOOM_OBJECT_ID,
  POOL_OBJECT_ID,
  WAITER_OBJECT_ID,
  normalizeChatText,
  ownsAvatarConfig,
  roomConfigForId,
} from '@social-square/shared';
import { moderateChatText, moderationService } from '../../services/ModerationService';
import { privateRoomService } from '../../services/PrivateRoomService';
import { socialService } from '../../services/SocialService';
import { logInfo } from '../../utils/logger';
import {
  avatarUpdateSchema,
  chatMessageSchema,
  emoteSchema,
  holdItemSchema,
  interactSchema,
  joinRoomSchema,
  moveSchema,
  whisperMessageSchema,
} from '../socketSchemas';
import { handleCounterInteraction } from './counterHandler';
import {
  emitChatToInterested,
  emitAvatarUpdateToInterested,
  emitEmoteToInterested,
  emitHeldItemToInterested,
  emitObjectStateChangedToInterested,
  emitPoseChangeWithInterest,
  emitUserJoinedToInterested,
  emitUserLeftToInterested,
  filteredRoomStateForViewer,
} from './interestBroadcaster';
import { handleJukeboxInteraction } from './jukeboxHandler';
import { handlePetalInteraction } from './petalHandler';
import { handlePoolInteraction, removePoolPlayer } from './poolHandler';
import { state, userService, type IoServer, type IoSocket } from './roomContext';
import {
  DIRECTIONS,
  hitSocketRate,
  isAvatarState,
  isEmoteId,
  isHeldItem,
  isSafeEventText,
  parseSocketPayload,
  persistUserPosition,
  sanitizeAvatarConfig,
  sanitizeSocketPayload,
  savedSpawnFor,
} from './roomUtils';
import { handleSeatInteraction } from './seatHandler';
import { handleWaiterInteraction } from './waiterHandler';
import type { Position } from '@social-square/shared';

export function registerRoomHandlers(io: IoServer, socket: IoSocket): void {
  const { userId, username } = socket.data;

  async function leaveCurrentRoom(): Promise<void> {
    const roomId = socket.data.currentRoom;
    if (!roomId) return;

    const clearedObjects = await state.clearObjectOccupancy(roomId, userId);
    await removePoolPlayer(io, roomId, userId);

    const roomState = await state.getRoomState(roomId);
    const leavingUser = roomState.users.find((user) => user.userId === userId);
    await socket.leave(roomId);
    socket.data.currentRoom = undefined;
    await state.removeUser(roomId, userId);

    if (leavingUser) await emitUserLeftToInterested(io, roomId, leavingUser, roomState.users);
    for (const object of clearedObjects) {
      await emitObjectStateChangedToInterested(io, roomId, object, roomState.users);
    }

    const count = await state.getUserCount(roomId);
    io.emit('room-users-count', { roomId, count });
  }

  socket.on('join-room', async (rawData) => {
    if (!(await hitSocketRate(socket, 'join-room', 6, 10_000))) return;
    const data = parseSocketPayload(socket, joinRoomSchema, rawData);
    if (!data) return;
    const { roomId, avatarConfig } = data;
    const roomConfig = roomConfigForId(roomId);
    if (!roomConfig) {
      socket.emit('error', { code: 'ROOM_NOT_FOUND', message: 'Stanza non trovata' });
      return;
    }
    if (!(await privateRoomService.canJoin(userId, roomId))) {
      socket.emit('error', { code: 'ROOM_INVITE_REQUIRED', message: 'Invito richiesto' });
      return;
    }

    await leaveCurrentRoom();

    const currentCount = await state.getUserCount(roomId);
    const spawnPoints = roomConfig.spawnPoints;
    const fallbackSpawn: Position = spawnPoints[currentCount % spawnPoints.length];
    const spawn = await savedSpawnFor(userId, roomId, fallbackSpawn);
    const requestedAvatarConfig = sanitizeAvatarConfig(avatarConfig, userId, username);
    const user = await userService.findById(userId);
    const safeAvatarConfig = user && ownsAvatarConfig(requestedAvatarConfig, user.unlockedItems)
      ? requestedAvatarConfig
      : sanitizeAvatarConfig(user?.avatarConfig ?? {}, userId, username);

    const userState = {
      userId,
      username,
      avatarConfig: safeAvatarConfig,
      position: spawn,
      state: 'idle' as const,
    };
    await userService.updateAvatarConfig(userId, userState.avatarConfig);
    await persistUserPosition(userId, roomId, spawn);

    await socket.join(roomId);
    socket.data.currentRoom = roomId;
    await state.addUser(roomId, userState);

    const roomState = await state.getRoomState(roomId);
    socket.emit('room-state', filteredRoomStateForViewer(roomState, userState));

    await emitUserJoinedToInterested(io, roomId, userState, roomState.users);

    const newCount = await state.getUserCount(roomId);
    io.emit('room-users-count', { roomId, count: newCount });

    logInfo('room.joined', { roomId, userId, username, users: newCount });
  });

  socket.on('avatar-update', async (rawData) => {
    if (!(await hitSocketRate(socket, 'avatar-update', 10, 10_000))) return;
    const data = parseSocketPayload(socket, avatarUpdateSchema, rawData);
    if (!data) return;
    const roomId = socket.data.currentRoom;
    if (!roomId) return;

    const user = await userService.findById(userId);
    if (!user) {
      socket.emit('error', { code: 'AUTH_REQUIRED', message: 'Accesso richiesto' });
      return;
    }

    const avatarConfig = sanitizeAvatarConfig(data.avatarConfig, userId, username);
    if (!ownsAvatarConfig(avatarConfig, user.unlockedItems)) {
      socket.emit('error', { code: 'COSMETIC_LOCKED', message: 'Cosmetico bloccato' });
      return;
    }

    const updated = await userService.updateAvatarConfig(userId, avatarConfig);
    const nextAvatarConfig = updated?.avatarConfig ?? avatarConfig;
    await state.updateAvatarConfig(roomId, userId, nextAvatarConfig);

    const roomState = await state.getRoomState(roomId);
    const roomUser = roomState.users.find((candidate) => candidate.userId === userId);
    if (roomUser) await emitAvatarUpdateToInterested(io, roomId, roomUser, roomState.users);
    socket.emit('account-updated', { avatarConfig: nextAvatarConfig });
  });

  socket.on('leave-room', async () => {
    await leaveCurrentRoom();
  });

  socket.on('move', async (rawData) => {
    if (!(await hitSocketRate(socket, 'move', 80, 10_000))) return;
    const data = parseSocketPayload(socket, moveSchema, rawData);
    if (!data) return;
    const { x, y, direction, state: moveState } = data;
    const roomId = socket.data.currentRoom;
    if (!roomId) return;
    if (!DIRECTIONS.has(direction) || !isAvatarState(moveState)) return;

    const roomState = await state.getRoomState(roomId);
    const previous = roomState.users.find((user) => user.userId === userId)?.position ?? { x, y };
    await state.updatePose(roomId, userId, { x, y }, moveState);
    await persistUserPosition(userId, roomId, { x, y });
    await emitPoseChangeWithInterest(io, socket, roomId, userId, previous, { x, y, direction, state: moveState });
  });

  socket.on('interact', async (rawData) => {
    if (!(await hitSocketRate(socket, 'interact', 24, 10_000))) return;
    const data = parseSocketPayload(socket, interactSchema, rawData);
    if (!data) return;
    const { objectId, action, payload: rawPayload } = data;
    const roomId = socket.data.currentRoom;
    if (!roomId) return;
    if (!isSafeEventText(objectId) || !isSafeEventText(action)) {
      socket.emit('error', { code: 'INVALID_PAYLOAD', message: 'Interazione non valida' });
      return;
    }
    const payload = sanitizeSocketPayload(rawPayload);

    if (objectId === BAR_SERVICE_OBJECT_ID) {
      await handleCounterInteraction(io, socket, roomId, userId, action, payload);
      return;
    }

    if (objectId === PETAL_BLOOM_OBJECT_ID) {
      await handlePetalInteraction(socket, roomId, userId, action, payload);
      return;
    }

    if (objectId === WAITER_OBJECT_ID) {
      await handleWaiterInteraction(io, socket, roomId, userId, username, objectId, action, payload);
      return;
    }

    if (objectId === JUKEBOX_OBJECT_ID) {
      await handleJukeboxInteraction(io, socket, roomId, userId, username, objectId, action, payload);
      return;
    }

    if (objectId === POOL_OBJECT_ID) {
      await handlePoolInteraction(io, socket, roomId, userId, username, objectId, action, payload);
      return;
    }

    if (await handleSeatInteraction(io, socket, roomId, userId, objectId, action, payload)) return;

    socket.emit('error', { code: 'UNKNOWN_INTERACTION', message: 'Oggetto sconosciuto' });
  });

  socket.on('emote', async (rawData) => {
    if (!(await hitSocketRate(socket, 'emote', 20, 10_000))) return;
    const data = parseSocketPayload(socket, emoteSchema, rawData);
    if (!data) return;
    const { emoteId } = data;
    const roomId = socket.data.currentRoom;
    if (!roomId || !isEmoteId(emoteId)) return;
    const roomState = await state.getRoomState(roomId);
    const sender = roomState.users.find((user) => user.userId === userId);
    if (sender) await emitEmoteToInterested(io, roomId, sender, emoteId, roomState.users);
  });

  socket.on('chat-message', async (rawData) => {
    if (!(await hitSocketRate(socket, 'chat', 8, 10_000))) return;
    const data = parseSocketPayload(socket, chatMessageSchema, rawData);
    if (!data) return;
    const { text } = data;
    const roomId = socket.data.currentRoom;
    if (!roomId) return;

    const normalized = normalizeChatText(text);
    if (!normalized) return;
    const moderated = moderateChatText(normalized);
    if (!moderated.ok) {
      socket.emit('error', { code: moderated.code ?? 'CHAT_REJECTED', message: 'Messaggio non consentito' });
      return;
    }

    const roomState = await state.getRoomState(roomId);
    const sender = roomState.users.find((user) => user.userId === userId);
    if (!sender) return;

    await emitChatToInterested(io, roomId, sender, {
      id: randomUUID(),
      roomId,
      userId,
      username,
      text: moderated.text,
      sentAt: Date.now(),
    }, roomState.users);
    const progressUpdate = await userService.recordProgressActivity(userId, 'chat');
    if (progressUpdate) {
      socket.emit('account-updated', {
        petals: progressUpdate.user.petals,
        stats: { ...progressUpdate.user.stats },
        progress: progressUpdate.progress,
      });
    }
  });

  socket.on('whisper-message', async (rawData) => {
    if (!(await hitSocketRate(socket, 'whisper', 12, 10_000))) return;
    const data = parseSocketPayload(socket, whisperMessageSchema, rawData);
    if (!data) return;
    if (data.toUserId === userId) return;
    const normalized = normalizeChatText(data.text);
    if (!normalized) return;
    const moderated = moderateChatText(normalized);
    if (!moderated.ok) {
      socket.emit('error', { code: moderated.code ?? 'CHAT_REJECTED', message: 'Messaggio non consentito' });
      return;
    }
    if (await moderationService.hasEitherBlock(userId, data.toUserId)) {
      socket.emit('error', { code: 'WHISPER_BLOCKED', message: 'Whisper bloccato' });
      return;
    }
    if (!(await socialService.areFriends(userId, data.toUserId))) {
      socket.emit('error', { code: 'WHISPER_NOT_FRIENDS', message: 'Whisper solo tra amici' });
      return;
    }

    const message = {
      id: randomUUID(),
      fromUserId: userId,
      fromUsername: username,
      toUserId: data.toUserId,
      text: moderated.text,
      sentAt: Date.now(),
    };
    socket.emit('whisper-message', message);
    io.to(`user:${data.toUserId}`).emit('whisper-message', message);
  });

  socket.on('hold-item', async (rawData) => {
    if (!(await hitSocketRate(socket, 'hold-item', 20, 10_000))) return;
    const data = parseSocketPayload(socket, holdItemSchema, rawData);
    if (!data) return;
    const { item } = data;
    const roomId = socket.data.currentRoom;
    if (!roomId) return;

    const safeItem = item === null || isHeldItem(item) ? item : null;
    await state.updateHeldItem(roomId, userId, safeItem);
    const roomState = await state.getRoomState(roomId);
    const holder = roomState.users.find((user) => user.userId === userId);
    if (holder) await emitHeldItemToInterested(io, roomId, holder, safeItem, roomState.users);
  });

  socket.on('disconnect', async () => {
    await leaveCurrentRoom();
    logInfo('socket.disconnected', { userId, username, socketId: socket.id });
  });
}
