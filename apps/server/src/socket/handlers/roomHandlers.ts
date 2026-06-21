import type { Server, Socket } from 'socket.io';
import { randomUUID } from 'node:crypto';
import {
  Direction,
  ROOM_CONFIGS,
  WAITER_OBJECT_ID,
  filterUsersByInterest,
  isJukeboxTrackId,
  isOrderItemId,
  isPositionInInterestRange,
  nextJukeboxTrackId,
  normalizeChatText,
  normalizeJukeboxState,
  normalizeWaiterState,
} from '@social-square/shared';
import type {
  AvatarState,
  ChatMessage,
  ClientToServerEvents,
  EmoteId,
  HeldItem,
  InterServerEvents,
  ObjectState,
  RoomState,
  ServerToClientEvents,
  SocketData,
  AvatarConfig,
  Position,
  WaiterState,
} from '@social-square/shared';
import { StateService } from '../../services/StateService';

type IoServer = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
type IoSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
type RoomUser = RoomState['users'][number];

const state = new StateService();
const EMOTE_IDS = new Set<EmoteId>(['wave', 'dance', 'clap']);
const SEAT_PREFIX = 'seat:';
const WAITER_HOME: Position = { x: 2, y: 1 };
const WAITER_COUNTER: Position = { x: 2, y: 0 };
const WAITER_TICK_MS = 260;
const WAITER_SPEED = 5.2;
const WAITER_BUSY_TTL_MS = 60_000;

interface WaiterRuntime {
  timers: Array<ReturnType<typeof setTimeout>>;
}

const waiterRuntimes = new Map<string, WaiterRuntime>();

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

function usersById(users: RoomUser[]): Map<string, RoomUser> {
  return new Map(users.map((user) => [user.userId, user]));
}

function canSeeUser(viewer: RoomUser, target: Pick<RoomUser, 'position'>): boolean {
  return isPositionInInterestRange(viewer.position, target.position);
}

function userJoinedPayload(user: RoomUser): Parameters<ServerToClientEvents['user-joined']>[0] {
  return {
    userId: user.userId,
    avatarConfig: user.avatarConfig,
    position: user.position,
    state: user.state,
    heldItem: user.heldItem ?? null,
  };
}

function filteredRoomStateForViewer(roomState: RoomState, viewer: RoomUser): RoomState {
  return {
    ...roomState,
    totalUsers: roomState.totalUsers ?? roomState.users.length,
    users: filterUsersByInterest(viewer, roomState.users),
  };
}

async function emitUserJoinedToInterested(
  io: IoServer,
  roomId: string,
  joined: RoomUser,
  users: RoomUser[],
): Promise<void> {
  const byId = usersById(users);
  const sockets = await io.in(roomId).fetchSockets();
  for (const peer of sockets) {
    const peerId = peer.data.userId;
    if (!peerId || peerId === joined.userId) continue;
    const viewer = byId.get(peerId);
    if (viewer && canSeeUser(viewer, joined)) peer.emit('user-joined', userJoinedPayload(joined));
  }
}

async function emitUserLeftToInterested(
  io: IoServer,
  roomId: string,
  leaving: RoomUser,
  users: RoomUser[],
): Promise<void> {
  const byId = usersById(users);
  const sockets = await io.in(roomId).fetchSockets();
  for (const peer of sockets) {
    const peerId = peer.data.userId;
    if (!peerId || peerId === leaving.userId) continue;
    const viewer = byId.get(peerId);
    if (viewer && canSeeUser(viewer, leaving)) peer.emit('user-left', { userId: leaving.userId });
  }
}

async function emitPoseChangeWithInterest(
  io: IoServer,
  socket: IoSocket,
  roomId: string,
  movingUserId: string,
  oldPosition: Position,
  move: { x: number; y: number; direction: Direction; state: AvatarState },
): Promise<void> {
  const roomState = await state.getRoomState(roomId);
  const byId = usersById(roomState.users);
  const mover = byId.get(movingUserId);
  if (!mover) return;

  const oldMover = { ...mover, position: oldPosition };
  const sockets = await io.in(roomId).fetchSockets();

  for (const peerSocket of sockets) {
    const peerId = peerSocket.data.userId;
    if (!peerId || peerId === movingUserId) continue;

    const peer = byId.get(peerId);
    if (!peer) continue;

    const wasMoverVisibleToPeer = canSeeUser(peer, oldMover);
    const isMoverVisibleToPeer = canSeeUser(peer, mover);
    if (isMoverVisibleToPeer) {
      if (wasMoverVisibleToPeer) {
        peerSocket.emit('user-moved', { userId: movingUserId, ...move });
      } else {
        peerSocket.emit('user-joined', userJoinedPayload(mover));
      }
    } else if (wasMoverVisibleToPeer) {
      peerSocket.emit('user-left', { userId: movingUserId });
    }

    const wasPeerVisibleToMover = canSeeUser(oldMover, peer);
    const isPeerVisibleToMover = canSeeUser(mover, peer);
    if (isPeerVisibleToMover && !wasPeerVisibleToMover) {
      socket.emit('user-joined', userJoinedPayload(peer));
    } else if (!isPeerVisibleToMover && wasPeerVisibleToMover) {
      socket.emit('user-left', { userId: peer.userId });
    }
  }
}

async function emitHeldItemToInterested(
  io: IoServer,
  roomId: string,
  holder: RoomUser,
  item: HeldItem,
  users: RoomUser[],
): Promise<void> {
  const byId = usersById(users);
  const sockets = await io.in(roomId).fetchSockets();
  for (const peer of sockets) {
    const peerId = peer.data.userId;
    if (!peerId || peerId === holder.userId) continue;
    const viewer = byId.get(peerId);
    if (viewer && canSeeUser(viewer, holder)) peer.emit('user-held-item', { userId: holder.userId, item });
  }
}

async function emitEmoteToInterested(
  io: IoServer,
  roomId: string,
  sender: RoomUser,
  emoteId: EmoteId,
  users: RoomUser[],
): Promise<void> {
  const byId = usersById(users);
  const sockets = await io.in(roomId).fetchSockets();
  for (const peer of sockets) {
    const peerId = peer.data.userId;
    if (!peerId || peerId === sender.userId) continue;
    const viewer = byId.get(peerId);
    if (viewer && canSeeUser(viewer, sender)) peer.emit('user-emote', { userId: sender.userId, emoteId });
  }
}

async function emitChatToInterested(
  io: IoServer,
  roomId: string,
  sender: RoomUser,
  message: ChatMessage,
  users: RoomUser[],
): Promise<void> {
  const byId = usersById(users);
  const sockets = await io.in(roomId).fetchSockets();
  for (const peer of sockets) {
    const peerId = peer.data.userId;
    if (!peerId) continue;
    if (peerId === sender.userId) {
      peer.emit('user-chat-message', message);
      continue;
    }

    const viewer = byId.get(peerId);
    if (viewer && canSeeUser(viewer, sender)) peer.emit('user-chat-message', message);
  }
}

function waiterRuntime(roomId: string): WaiterRuntime {
  let runtime = waiterRuntimes.get(roomId);
  if (!runtime) {
    runtime = { timers: [] };
    waiterRuntimes.set(roomId, runtime);
  }
  return runtime;
}

function clearWaiterRuntime(roomId: string): void {
  const runtime = waiterRuntimes.get(roomId);
  if (!runtime) return;
  for (const timer of runtime.timers) clearTimeout(timer);
  runtime.timers = [];
}

function scheduleWaiter(roomId: string, callback: () => void, delay: number): void {
  const runtime = waiterRuntime(roomId);
  const timer = setTimeout(() => {
    runtime.timers = runtime.timers.filter((candidate) => candidate !== timer);
    callback();
  }, delay);
  runtime.timers.push(timer);
}

async function emitWaiterState(io: IoServer, roomId: string, nextState: WaiterState): Promise<void> {
  const objectState = nextState as unknown as ObjectState;
  await state.updateObjectState(roomId, WAITER_OBJECT_ID, objectState);
  io.to(roomId).emit('object-state-changed', { objectId: WAITER_OBJECT_ID, state: objectState });
}

function isWaiterBusy(waiter: WaiterState, now: number): boolean {
  if (now - waiter.updatedAt > WAITER_BUSY_TTL_MS) return false;
  return waiter.phase !== 'idle' && waiter.phase !== 'delivered';
}

function driveWaiterTo(
  io: IoServer,
  roomId: string,
  waiter: WaiterState,
  target: Position,
  phase: WaiterState['phase'],
  onArrive: (arrived: WaiterState) => void,
): void {
  const stepCells = (WAITER_SPEED * WAITER_TICK_MS) / 1000;
  const dx = target.x - waiter.x;
  const dy = target.y - waiter.y;
  const distance = Math.sqrt(dx * dx + dy * dy);
  const now = Date.now();

  const nextState: WaiterState = distance <= stepCells
    ? {
        ...waiter,
        phase,
        x: target.x,
        y: target.y,
        targetX: target.x,
        targetY: target.y,
        updatedAt: now,
      }
    : {
        ...waiter,
        phase,
        x: waiter.x + (dx / distance) * stepCells,
        y: waiter.y + (dy / distance) * stepCells,
        targetX: target.x,
        targetY: target.y,
        updatedAt: now,
      };

  void emitWaiterState(io, roomId, nextState).then(() => {
    if (distance <= stepCells) {
      onArrive(nextState);
      return;
    }

    scheduleWaiter(roomId, () => driveWaiterTo(io, roomId, nextState, target, phase, onArrive), WAITER_TICK_MS);
  });
}

async function startWaiterCall(
  io: IoServer,
  roomId: string,
  userId: string,
  username: string,
  target: Position,
): Promise<void> {
  clearWaiterRuntime(roomId);
  const current = normalizeWaiterState(await state.getObjectState(roomId, WAITER_OBJECT_ID));
  const waiter: WaiterState = {
    ...current,
    kind: 'waiter',
    phase: 'approaching',
    customerId: userId,
    customerName: username,
    targetX: target.x,
    targetY: target.y,
    item: undefined,
    orderId: undefined,
    updatedAt: Date.now(),
  };

  driveWaiterTo(io, roomId, waiter, target, 'approaching', (arrived) => {
    void emitWaiterState(io, roomId, {
      ...arrived,
      phase: 'awaiting-order',
      updatedAt: Date.now(),
    });
  });
}

function startWaiterOrder(
  io: IoServer,
  roomId: string,
  waiter: WaiterState,
  item: WaiterState['item'],
): void {
  if (!item || !waiter.customerId || waiter.targetX === undefined || waiter.targetY === undefined) return;
  clearWaiterRuntime(roomId);
  const orderId = randomUUID();
  const customerTarget = { x: waiter.targetX, y: waiter.targetY };
  const toCounter: WaiterState = {
    ...waiter,
    phase: 'to-counter',
    item,
    orderId,
    updatedAt: Date.now(),
  };

  driveWaiterTo(io, roomId, toCounter, WAITER_COUNTER, 'to-counter', (atCounter) => {
    scheduleWaiter(roomId, () => {
      const delivering: WaiterState = {
        ...atCounter,
        phase: 'delivering',
        item,
        orderId,
        updatedAt: Date.now(),
      };
      driveWaiterTo(io, roomId, delivering, customerTarget, 'delivering', (arrived) => {
        void emitWaiterState(io, roomId, {
          ...arrived,
          phase: 'delivered',
          item,
          orderId,
          updatedAt: Date.now(),
        });

        scheduleWaiter(roomId, () => {
          const returning: WaiterState = {
            ...arrived,
            phase: 'returning',
            item: undefined,
            orderId: undefined,
            customerId: undefined,
            customerName: undefined,
            updatedAt: Date.now(),
          };
          driveWaiterTo(io, roomId, returning, WAITER_HOME, 'returning', (home) => {
            void emitWaiterState(io, roomId, {
              ...home,
              phase: 'idle',
              targetX: undefined,
              targetY: undefined,
              updatedAt: Date.now(),
            });
          });
        }, 1800);
      });
    }, 700);
  });
}

export function registerRoomHandlers(io: IoServer, socket: IoSocket): void {
  const { userId, username } = socket.data;

  async function leaveCurrentRoom(): Promise<void> {
    const roomId = socket.data.currentRoom;
    if (!roomId) return;
    const clearedObjects = await state.clearObjectOccupancy(roomId, userId);
    const roomState = await state.getRoomState(roomId);
    const leavingUser = roomState.users.find((user) => user.userId === userId);
    await socket.leave(roomId);
    socket.data.currentRoom = undefined;
    await state.removeUser(roomId, userId);
    if (leavingUser) await emitUserLeftToInterested(io, roomId, leavingUser, roomState.users);
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

    // Send an interest-filtered room state only to the joining client.
    const roomState = await state.getRoomState(roomId);
    socket.emit('room-state', filteredRoomStateForViewer(roomState, userState));

    await emitUserJoinedToInterested(io, roomId, userState, roomState.users);

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

    const roomState = await state.getRoomState(roomId);
    const previous = roomState.users.find((user) => user.userId === userId)?.position ?? { x, y };
    await state.updatePose(roomId, userId, { x, y }, moveState);
    await emitPoseChangeWithInterest(io, socket, roomId, userId, previous, { x, y, direction, state: moveState });
  });

  socket.on('interact', async ({ objectId, action, payload }) => {
    const roomId = socket.data.currentRoom;
    if (!roomId) return;

    if (objectId === WAITER_OBJECT_ID) {
      const now = Date.now();
      const current = normalizeWaiterState(await state.getObjectState(roomId, objectId), now);

      if (action === 'waiter-call') {
        if (isWaiterBusy(current, now)) {
          socket.emit('error', { code: 'WAITER_BUSY', message: 'Il cameriere sta gia servendo qualcuno' });
          return;
        }

        const target = seatPositionFrom(payload);
        if (!target) {
          socket.emit('error', { code: 'INVALID_WAITER_TARGET', message: 'Posizione ordine non valida' });
          return;
        }

        await startWaiterCall(io, roomId, userId, username, target);
        return;
      }

      if (action === 'waiter-order') {
        if (current.phase !== 'awaiting-order' || current.customerId !== userId) {
          socket.emit('error', { code: 'WAITER_NOT_READY', message: 'Il cameriere non e pronto per questo ordine' });
          return;
        }

        const item = isOrderItemId(payload?.item) ? payload.item : null;
        if (!item) {
          socket.emit('error', { code: 'INVALID_ORDER_ITEM', message: 'Ordine non valido' });
          return;
        }

        const position = seatPositionFrom(payload);
        startWaiterOrder(io, roomId, position ? {
          ...current,
          targetX: position.x,
          targetY: position.y,
        } : current, item);
        return;
      }

      socket.emit('error', { code: 'UNKNOWN_INTERACTION', message: 'Azione cameriere sconosciuta' });
      return;
    }

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

        const roomState = await state.getRoomState(roomId);
        const previous = roomState.users.find((user) => user.userId === userId)?.position ?? position;
        await state.updateObjectState(roomId, objectId, next);
        await state.updatePose(roomId, userId, position, 'sit');
        io.to(roomId).emit('object-state-changed', { objectId, state: next });
        socket.emit('user-moved', {
          userId,
          x: position.x,
          y: position.y,
          direction: Direction.SE,
          state: 'sit' as AvatarState,
        });
        await emitPoseChangeWithInterest(io, socket, roomId, userId, previous, {
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
          const roomState = await state.getRoomState(roomId);
          const previous = roomState.users.find((user) => user.userId === userId)?.position ?? position;
          await state.updatePose(roomId, userId, position, 'idle');
          socket.emit('user-moved', {
            userId,
            x: position.x,
            y: position.y,
            direction: Direction.SE,
            state: 'idle' as AvatarState,
          });
          await emitPoseChangeWithInterest(io, socket, roomId, userId, previous, {
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

  socket.on('emote', async ({ emoteId }) => {
    const roomId = socket.data.currentRoom;
    if (!roomId || !isEmoteId(emoteId)) return;
    const roomState = await state.getRoomState(roomId);
    const sender = roomState.users.find((user) => user.userId === userId);
    if (sender) await emitEmoteToInterested(io, roomId, sender, emoteId, roomState.users);
  });

  socket.on('chat-message', async ({ text }) => {
    const roomId = socket.data.currentRoom;
    if (!roomId) return;

    const normalized = normalizeChatText(text);
    if (!normalized) return;

    const roomState = await state.getRoomState(roomId);
    const sender = roomState.users.find((user) => user.userId === userId);
    if (!sender) return;

    await emitChatToInterested(io, roomId, sender, {
      id: randomUUID(),
      roomId,
      userId,
      username,
      text: normalized,
      sentAt: Date.now(),
    }, roomState.users);
  });

  socket.on('hold-item', async ({ item }) => {
    const roomId = socket.data.currentRoom;
    if (!roomId) return;

    await state.updateHeldItem(roomId, userId, item);
    const roomState = await state.getRoomState(roomId);
    const holder = roomState.users.find((user) => user.userId === userId);
    if (holder) await emitHeldItemToInterested(io, roomId, holder, item, roomState.users);
  });

  socket.on('disconnect', async () => {
    await leaveCurrentRoom();
    console.log(`[Socket] Disconnected: ${username} (${socket.id})`);
  });
}
