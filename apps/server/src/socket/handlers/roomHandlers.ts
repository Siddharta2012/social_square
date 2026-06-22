import type { Server, Socket } from 'socket.io';
import { randomUUID } from 'node:crypto';
import {
  Direction,
  BAR_BEER_POSITION,
  BAR_PRETZEL_POSITION,
  BAR_SERVICE_OBJECT_ID,
  INTERACTION_RADIUS_TILES,
  PETAL_ACTION_COST,
  PETAL_BLOOM_OBJECT_ID,
  POOL_OBJECT_ID,
  POOL_PLAY_DURATION_MS,
  POOL_PLAY_COST,
  POOL_POSITION,
  JUKEBOX_PLAY_COST,
  JUKEBOX_PLAY_DURATION_MS,
  JUKEBOX_OBJECT_ID,
  JUKEBOX_POSITION,
  petalPointKey,
  petalSpawnConfigForLocation,
  ROOM_CONFIGS,
  WAITER_OBJECT_ID,
  filterObjectsByInterest,
  filterUsersByInterest,
  isJukeboxTrackId,
  isOrderItemId,
  isObjectVisibleToViewer,
  isPositionInInterestRange,
  isSeatObjectId,
  isWithinInteractionRange,
  jukeboxTitle,
  nextJukeboxTrackId,
  normalizeChatText,
  normalizeJukeboxState,
  normalizePoolState,
  normalizeWaiterState,
  parsePoolBalls,
  poolStateToObjectState,
  resolvePoolShot,
  parseJukeboxExternalTrack,
  positionToSector,
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
  WaiterQueueEntry,
  JukeboxState,
  PoolState,
} from '@social-square/shared';
import { StateService } from '../../services/StateService';
import { UserService } from '../../services/UserService';
import { socketRateLimiter } from '../../utils/rateLimit';
import { logInfo, logWarn } from '../../utils/logger';

type IoServer = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
type IoSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
type RoomUser = RoomState['users'][number];
type RoomObject = RoomState['objects'][number];

const state = new StateService();
const userService = new UserService();
const EMOTE_IDS = new Set<EmoteId>(['wave', 'dance', 'clap']);
const AVATAR_STATES = new Set<AvatarState>(['idle', 'walk', 'sit', 'wave', 'dance', 'clap', 'fish']);
const DIRECTIONS = new Set<number>(Object.values(Direction).filter((value): value is number => typeof value === 'number'));
const WAITER_HOME: Position = { x: 2, y: 1 };
const WAITER_COUNTER: Position = { x: 2, y: 0 };
const WAITER_TICK_MS = 260;
const WAITER_SPEED = 5.2;
const WAITER_BUSY_TTL_MS = 60_000;
const WAITER_QUEUE_LIMIT = 6;
const WAITER_CALL_COOLDOWN_MS = 1800;
const PETAL_SERVER_COLLECT_RADIUS_TILES = 1.6;

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

function isAvatarState(value: unknown): value is AvatarState {
  return typeof value === 'string' && AVATAR_STATES.has(value as AvatarState);
}

function usersById(users: RoomUser[]): Map<string, RoomUser> {
  return new Map(users.map((user) => [user.userId, user]));
}

function canSeeUser(viewer: RoomUser, target: Pick<RoomUser, 'position'>): boolean {
  return isPositionInInterestRange(viewer.position, target.position);
}

function changedSector(a: Position, b: Position): boolean {
  const sectorA = positionToSector(a);
  const sectorB = positionToSector(b);
  return sectorA.sx !== sectorB.sx || sectorA.sy !== sectorB.sy;
}

function locationIdFor(position: Position): string {
  const sector = positionToSector(position);
  return `${sector.sx},${sector.sy}`;
}

function isHeldItem(value: unknown): value is Exclude<HeldItem, null> {
  return value === 'beer' || value === 'pretzel';
}

function isActiveJukebox(state: ReturnType<typeof normalizeJukeboxState>, now = Date.now()): boolean {
  return state.playing && (state.expiresAt === null || state.expiresAt > now);
}

function withJukeboxHistory(next: JukeboxState, requester: string, now: number): JukeboxState {
  const title = next.externalTrack?.title ?? jukeboxTitle(next.trackId);
  const source: 'local' | 'youtube' = next.externalTrack?.provider ?? 'local';
  return {
    ...next,
    history: [
      {
        trackId: next.trackId,
        title,
        source,
        requestedBy: requester,
        startedAt: now,
      },
      ...(next.history ?? []),
    ].slice(0, 8),
  };
}

function poolPlayer(state: PoolState, userId: string): PoolState['players'][number] | undefined {
  return state.players.find((player) => player.userId === userId);
}

function poolIsExpired(state: PoolState, now = Date.now()): boolean {
  return (state.phase === 'waiting' || state.phase === 'playing') &&
    typeof state.expiresAt === 'number' &&
    state.expiresAt <= now;
}

function expiredPoolState(now = Date.now()): PoolState {
  return {
    ...normalizePoolState(null, now),
    phase: 'finished',
    message: 'Tempo biliardo scaduto',
    updatedAt: now,
  };
}

async function emitPoolState(io: IoServer, roomId: string, nextState: PoolState): Promise<void> {
  const objectState = poolStateToObjectState(nextState);
  await state.updateObjectState(roomId, POOL_OBJECT_ID, objectState);
  await emitObjectStateChangedToInterested(io, roomId, { objectId: POOL_OBJECT_ID, state: objectState });
}

async function currentRoomUser(roomId: string, userId: string): Promise<RoomUser | null> {
  const roomState = await state.getRoomState(roomId);
  return roomState.users.find((user) => user.userId === userId) ?? null;
}

function emitTooFar(socket: IoSocket, message: string): void {
  socket.emit('error', { code: 'TOO_FAR', message });
}

function socketRateKey(socket: IoSocket, bucket: string): string {
  return `socket:${bucket}:${socket.data.userId}:${socket.id}`;
}

function hitSocketRate(socket: IoSocket, bucket: string, limit: number, windowMs: number): boolean {
  const result = socketRateLimiter.hit(socketRateKey(socket, bucket), limit, windowMs);
  if (result.allowed) return true;
  socket.emit('error', { code: 'RATE_LIMIT', message: 'Troppe azioni, rallenta un attimo' });
  logWarn('socket.rate_limited', {
    bucket,
    userId: socket.data.userId,
    socketId: socket.id,
    retryAfterMs: result.retryAfterMs,
  });
  return false;
}

function isSafeEventText(value: unknown, maxLength = 80): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= maxLength;
}

function safeAvatarPart(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
}

function sanitizeAvatarConfig(value: unknown, userId: string, username: string): AvatarConfig {
  const raw = value && typeof value === 'object' ? value as Partial<AvatarConfig> : {};
  return {
    userId,
    username,
    body: safeAvatarPart(raw.body),
    outfit: safeAvatarPart(raw.outfit),
    hair: safeAvatarPart(raw.hair),
    hairColor: typeof raw.hairColor === 'string' && /^#[0-9a-fA-F]{6}$/.test(raw.hairColor) ? raw.hairColor : '#4488ff',
    accessory: safeAvatarPart(raw.accessory),
    expression: safeAvatarPart(raw.expression),
  };
}

function sanitizeSocketPayload(value: unknown): ObjectState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const output: ObjectState = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>).slice(0, 16)) {
    if (!/^[a-zA-Z0-9:_-]{1,48}$/.test(key)) continue;
    if (typeof raw === 'string') output[key] = raw.slice(0, 500);
    else if (typeof raw === 'number' && Number.isFinite(raw)) output[key] = raw;
    else if (typeof raw === 'boolean' || raw === null) output[key] = raw;
  }
  return output;
}

async function ensureUserNear(
  socket: IoSocket,
  roomId: string,
  userId: string,
  target: Position,
  message: string,
): Promise<RoomUser | null> {
  const user = await currentRoomUser(roomId, userId);
  if (!user || !isWithinInteractionRange(user.position, target, INTERACTION_RADIUS_TILES)) {
    emitTooFar(socket, message);
    return null;
  }
  return user;
}

async function persistUserPosition(userId: string, roomId: string, position: Position): Promise<void> {
  await userService.updatePosition(userId, {
    roomId,
    x: position.x,
    y: position.y,
    locationId: locationIdFor(position),
    updatedAt: Date.now(),
  });
}

async function savedSpawnFor(userId: string, roomId: string, fallback: Position): Promise<Position> {
  const user = await userService.findById(userId);
  if (!user?.position || user.position.roomId !== roomId) return fallback;
  return { x: user.position.x, y: user.position.y };
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
    objects: filterObjectsByInterest(viewer, roomState.objects),
  };
}

async function emitObjectStateChangedToInterested(
  io: IoServer,
  roomId: string,
  object: RoomObject,
  users?: RoomUser[],
): Promise<void> {
  const roomUsers = users ?? (await state.getRoomState(roomId)).users;
  const byId = usersById(roomUsers);
  const sockets = await io.in(roomId).fetchSockets();

  for (const peer of sockets) {
    const peerId = peer.data.userId;
    if (!peerId) continue;
    const viewer = byId.get(peerId);
    if (viewer && isObjectVisibleToViewer(viewer, object)) peer.emit('object-state-changed', object);
  }
}

function syncObjectsForViewer(socket: IoSocket, roomState: RoomState, viewer: RoomUser): void {
  for (const object of filterObjectsByInterest(viewer, roomState.objects)) {
    socket.emit('object-state-changed', object);
  }
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

  if (changedSector(oldPosition, mover.position)) syncObjectsForViewer(socket, roomState, mover);
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
  await emitObjectStateChangedToInterested(io, roomId, { objectId: WAITER_OBJECT_ID, state: objectState });
}

function isWaiterBusy(waiter: WaiterState, now: number): boolean {
  if (now - waiter.updatedAt > WAITER_BUSY_TTL_MS) return false;
  return waiter.phase !== 'idle';
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
  queue: WaiterQueueEntry[] = [],
): Promise<void> {
  clearWaiterRuntime(roomId);
  const current = normalizeWaiterState(await state.getObjectState(roomId, WAITER_OBJECT_ID));
  const now = Date.now();
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
    queue: queue.length > 0 ? queue : undefined,
    cooldownUntil: now + WAITER_CALL_COOLDOWN_MS,
    updatedAt: now,
  };

  driveWaiterTo(io, roomId, waiter, target, 'approaching', (arrived) => {
    void emitWaiterState(io, roomId, {
      ...arrived,
      phase: 'awaiting-order',
      updatedAt: Date.now(),
    });
  });
}

async function finishWaiterReturn(io: IoServer, roomId: string, home: WaiterState): Promise<void> {
  const queue = home.queue ?? [];
  if (queue.length === 0) {
    await emitWaiterState(io, roomId, {
      ...home,
      phase: 'idle',
      targetX: undefined,
      targetY: undefined,
      queue: undefined,
      updatedAt: Date.now(),
    });
    return;
  }

  const [next, ...rest] = queue;
  await startWaiterCall(
    io,
    roomId,
    next.userId,
    next.username,
    { x: next.x, y: next.y },
    rest,
  );
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
            void finishWaiterReturn(io, roomId, {
              ...home,
              phase: 'returning',
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
    const poolState = normalizePoolState(await state.getObjectState(roomId, POOL_OBJECT_ID));
    const poolPlayers = poolState.players.filter((player) => player.userId !== userId);
    if (poolPlayers.length !== poolState.players.length) {
      const nextPool = poolPlayers.length === 0
        ? normalizePoolState(null)
        : {
            ...poolState,
            phase: poolState.mode === 'duo' && poolPlayers.length === 1 ? 'waiting' as const : poolState.phase,
            players: poolPlayers,
            turnUserId: poolPlayers[0]?.userId,
            updatedAt: Date.now(),
          };
      await emitPoolState(io, roomId, nextPool);
    }
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

  socket.on('join-room', async ({ roomId, avatarConfig }) => {
    if (!hitSocketRate(socket, 'join-room', 6, 10_000)) return;
    const roomConfig = ROOM_CONFIGS[roomId];
    if (!roomConfig) {
      socket.emit('error', { code: 'ROOM_NOT_FOUND', message: 'Stanza non trovata' });
      return;
    }

    await leaveCurrentRoom();

    // Pick spawn point cycling through available slots
    const currentCount = await state.getUserCount(roomId);
    const spawnPoints = roomConfig.spawnPoints;
    const fallbackSpawn: Position = spawnPoints[currentCount % spawnPoints.length];
    const spawn = await savedSpawnFor(userId, roomId, fallbackSpawn);
    const safeAvatarConfig = sanitizeAvatarConfig(avatarConfig, userId, username);

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

    // Send an interest-filtered room state only to the joining client.
    const roomState = await state.getRoomState(roomId);
    socket.emit('room-state', filteredRoomStateForViewer(roomState, userState));

    await emitUserJoinedToInterested(io, roomId, userState, roomState.users);

    const newCount = await state.getUserCount(roomId);
    io.emit('room-users-count', { roomId, count: newCount });

    logInfo('room.joined', { roomId, userId, username, users: newCount });
  });

  socket.on('leave-room', async () => {
    await leaveCurrentRoom();
  });

  socket.on('move', async ({ x, y, direction, state: moveState }) => {
    if (!hitSocketRate(socket, 'move', 80, 10_000)) return;
    const roomId = socket.data.currentRoom;
    if (!roomId) return;
    if (!Number.isFinite(x) || !Number.isFinite(y) || !DIRECTIONS.has(direction) || !isAvatarState(moveState)) return;

    const roomState = await state.getRoomState(roomId);
    const previous = roomState.users.find((user) => user.userId === userId)?.position ?? { x, y };
    await state.updatePose(roomId, userId, { x, y }, moveState);
    await persistUserPosition(userId, roomId, { x, y });
    await emitPoseChangeWithInterest(io, socket, roomId, userId, previous, { x, y, direction, state: moveState });
  });

  socket.on('interact', async ({ objectId, action, payload: rawPayload }) => {
    if (!hitSocketRate(socket, 'interact', 24, 10_000)) return;
    const roomId = socket.data.currentRoom;
    if (!roomId) return;
    if (!isSafeEventText(objectId) || !isSafeEventText(action)) {
      socket.emit('error', { code: 'INVALID_PAYLOAD', message: 'Interazione non valida' });
      return;
    }
    const payload = sanitizeSocketPayload(rawPayload);

    if (objectId === BAR_SERVICE_OBJECT_ID) {
      if (action !== 'pickup-item') {
        socket.emit('error', { code: 'UNKNOWN_INTERACTION', message: 'Azione banco sconosciuta' });
        return;
      }

      const item = isHeldItem(payload?.item) ? payload.item : null;
      if (!item) {
        socket.emit('error', { code: 'INVALID_ITEM', message: 'Oggetto non valido' });
        return;
      }

      const target = item === 'beer' ? BAR_BEER_POSITION : BAR_PRETZEL_POSITION;
      const buyer = await ensureUserNear(socket, roomId, userId, target, 'Avvicinati al bancone');
      if (!buyer) return;
      if (locationIdFor(buyer.position) !== '0,0') {
        socket.emit('error', { code: 'WRONG_LOCATION', message: 'Il bancone e nel bar' });
        return;
      }

      const paidUser = await userService.spendPetals(userId, PETAL_ACTION_COST, 'counter');
      if (!paidUser) {
        socket.emit('error', { code: 'INSUFFICIENT_PETALS', message: `Servono ${PETAL_ACTION_COST} petali` });
        return;
      }

      await state.updateHeldItem(roomId, userId, item);
      const roomState = await state.getRoomState(roomId);
      const holder = roomState.users.find((user) => user.userId === userId);
      socket.emit('item-granted', { item, petals: paidUser.petals, cost: PETAL_ACTION_COST, source: 'counter' });
      socket.emit('account-updated', { petals: paidUser.petals, stats: { ...paidUser.stats } });
      logInfo('economy.spend', { userId, source: 'counter', item, amount: PETAL_ACTION_COST, petals: paidUser.petals });
      if (holder) await emitHeldItemToInterested(io, roomId, holder, item, roomState.users);
      return;
    }

    if (objectId === PETAL_BLOOM_OBJECT_ID) {
      const requestId = isSafeEventText(payload.requestId, 80) ? payload.requestId : undefined;
      const emitPetalError = (code: string, message: string) => {
        socket.emit('error', { code, message, requestId });
      };

      const petalRate = socketRateLimiter.hit(socketRateKey(socket, 'petal'), 16, 10_000);
      if (!petalRate.allowed) {
        // Emit WITH the requestId so the client clears the exact pending collect
        // instead of guessing "the latest one" and orphaning the real failure.
        emitPetalError('PETAL_RATE_LIMIT', 'Troppi petali troppo in fretta, rallenta un attimo');
        logWarn('socket.rate_limited', {
          bucket: 'petal',
          userId,
          socketId: socket.id,
          retryAfterMs: petalRate.retryAfterMs,
        });
        return;
      }
      if (action !== 'petal-collect') {
        emitPetalError('UNKNOWN_INTERACTION', 'Azione petali sconosciuta');
        return;
      }

      const x = typeof payload?.x === 'number' ? payload.x : NaN;
      const y = typeof payload?.y === 'number' ? payload.y : NaN;
      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        emitPetalError('INVALID_PETAL', 'Petali non validi');
        return;
      }

      const roomUser = await currentRoomUser(roomId, userId);
      if (!roomUser) return;
      const locationId = locationIdFor(roomUser.position);
      const config = petalSpawnConfigForLocation(locationId);
      const point = config?.points.find((candidate) => (
        Math.round(candidate.x) === Math.round(x) &&
        Math.round(candidate.y) === Math.round(y)
      ));
      if (!config || !point) {
        emitPetalError('INVALID_PETAL', 'Fiore non disponibile qui');
        return;
      }
      if (!isWithinInteractionRange(roomUser.position, point, PETAL_SERVER_COLLECT_RADIUS_TILES)) {
        emitPetalError('TOO_FAR', 'Avvicinati ai petali');
        return;
      }

      const pointKey = petalPointKey(point);
      const reserved = await state.reservePetalCollect(userId, locationId, pointKey, config.intervalMs);
      if (!reserved) {
        emitPetalError('PETAL_COOLDOWN', 'Questo fiore deve ricrescere');
        return;
      }

      const nextUser = await userService.awardPetals(userId, config.value, 'flower');
      if (!nextUser) return;
      socket.emit('petals-collected', {
        amount: config.value,
        petals: nextUser.petals,
        position: point,
        source: 'flower',
        requestId,
      });
      socket.emit('account-updated', { petals: nextUser.petals, stats: { ...nextUser.stats } });
      logInfo('economy.award', { userId, source: 'flower', amount: config.value, petals: nextUser.petals, locationId });
      return;
    }

    if (objectId === WAITER_OBJECT_ID) {
      const now = Date.now();
      const current = normalizeWaiterState(await state.getObjectState(roomId, objectId), now);

      if (action === 'waiter-call') {
        const caller = await ensureUserNear(
          socket,
          roomId,
          userId,
          { x: current.x, y: current.y },
          'Avvicinati al cameriere',
        );
        if (!caller) return;

        if (current.cooldownUntil && current.cooldownUntil > now && !isWaiterBusy(current, now)) {
          socket.emit('error', { code: 'WAITER_COOLDOWN', message: 'Aspetta un attimo prima di richiamarlo' });
          return;
        }

        if (isWaiterBusy(current, now)) {
          const queue = current.queue ?? [];
          if (current.customerId === userId || queue.some((entry) => entry.userId === userId)) {
            socket.emit('error', { code: 'WAITER_ALREADY_WAITING', message: 'Sei gia in attesa del cameriere' });
            return;
          }
          if (queue.length >= WAITER_QUEUE_LIMIT) {
            socket.emit('error', { code: 'WAITER_QUEUE_FULL', message: 'La coda del cameriere e piena' });
            return;
          }

          const nextQueue: WaiterQueueEntry[] = [
            ...queue,
            {
              userId,
              username,
              x: Math.round(caller.position.x),
              y: Math.round(caller.position.y),
              requestedAt: now,
            },
          ];
          await emitWaiterState(io, roomId, {
            ...current,
            queue: nextQueue,
            updatedAt: now,
          });
          socket.emit('error', { code: 'WAITER_QUEUED', message: `Sei in coda (${nextQueue.length})` });
          return;
        }

        await startWaiterCall(io, roomId, userId, username, {
          x: Math.round(caller.position.x),
          y: Math.round(caller.position.y),
        }, current.queue ?? []);
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

        const customer = await ensureUserNear(
          socket,
          roomId,
          userId,
          { x: current.x, y: current.y },
          'Avvicinati al cameriere',
        );
        if (!customer) return;

        const paidUser = await userService.spendPetals(userId, PETAL_ACTION_COST, 'waiter');
        if (!paidUser) {
          socket.emit('error', { code: 'INSUFFICIENT_PETALS', message: `Servono ${PETAL_ACTION_COST} petali` });
          return;
        }
        socket.emit('account-updated', { petals: paidUser.petals, stats: { ...paidUser.stats } });
        logInfo('economy.spend', { userId, source: 'waiter', item, amount: PETAL_ACTION_COST, petals: paidUser.petals });

        startWaiterOrder(io, roomId, {
          ...current,
          targetX: Math.round(customer.position.x),
          targetY: Math.round(customer.position.y),
        }, item);
        return;
      }

      socket.emit('error', { code: 'UNKNOWN_INTERACTION', message: 'Azione cameriere sconosciuta' });
      return;
    }

    if (objectId === JUKEBOX_OBJECT_ID) {
      const listener = await ensureUserNear(
        socket,
        roomId,
        userId,
        JUKEBOX_POSITION,
        'Avvicinati al jukebox',
      );
      if (!listener) return;

      const now = Date.now();
      const current = normalizeJukeboxState(await state.getObjectState(roomId, objectId), now);
      let next = current;

      if (isActiveJukebox(current, now)) {
        socket.emit('error', { code: 'JUKEBOX_LOCKED', message: 'Il jukebox e gia in corso' });
        return;
      }

      let requiresPayment = false;
      if (action === 'jukebox-toggle') {
        next = {
          ...current,
          playing: true,
          startedAt: now,
          expiresAt: now + JUKEBOX_PLAY_DURATION_MS,
          updatedAt: now,
          requestedBy: username,
        };
        requiresPayment = true;
      } else if (action === 'jukebox-next') {
        next = {
          ...current,
          trackId: nextJukeboxTrackId(current.trackId),
          externalTrack: undefined,
          playing: true,
          startedAt: now,
          expiresAt: now + JUKEBOX_PLAY_DURATION_MS,
          updatedAt: now,
          requestedBy: username,
        };
        requiresPayment = true;
      } else if (action === 'jukebox-play-track') {
        const trackId = isJukeboxTrackId(payload?.trackId)
          ? payload.trackId
          : current.trackId;
        next = {
          ...current,
          trackId,
          externalTrack: undefined,
          playing: true,
          startedAt: now,
          expiresAt: now + JUKEBOX_PLAY_DURATION_MS,
          updatedAt: now,
          requestedBy: username,
        };
        requiresPayment = true;
      } else if (action === 'jukebox-play-url') {
        const externalTrack = parseJukeboxExternalTrack(payload?.url);
        if (!externalTrack) {
          socket.emit('error', { code: 'INVALID_MEDIA_URL', message: 'Link YouTube non valido' });
          return;
        }
        next = {
          ...current,
          externalTrack,
          playing: true,
          startedAt: now,
          expiresAt: now + JUKEBOX_PLAY_DURATION_MS,
          updatedAt: now,
          requestedBy: username,
        };
        requiresPayment = true;
      } else if (action === 'jukebox-stop') {
        socket.emit('error', { code: 'JUKEBOX_LOCKED', message: 'Il jukebox non si puo interrompere' });
        return;
      } else {
        socket.emit('error', { code: 'UNKNOWN_INTERACTION', message: 'Azione jukebox sconosciuta' });
        return;
      }

      if (requiresPayment) {
        const paidUser = await userService.spendPetals(userId, JUKEBOX_PLAY_COST, 'jukebox');
        if (!paidUser) {
          socket.emit('error', { code: 'INSUFFICIENT_PETALS', message: `Servono ${JUKEBOX_PLAY_COST} petali` });
          return;
        }
        socket.emit('account-updated', { petals: paidUser.petals, stats: { ...paidUser.stats } });
        next = withJukeboxHistory(next, username, now);
        logInfo('economy.spend', { userId, source: 'jukebox', amount: JUKEBOX_PLAY_COST, petals: paidUser.petals });
      }

      await state.updateObjectState(roomId, objectId, next as unknown as ObjectState);
      await emitObjectStateChangedToInterested(io, roomId, { objectId, state: next as unknown as ObjectState });
      return;
    }

    if (objectId === POOL_OBJECT_ID) {
      const player = await ensureUserNear(
        socket,
        roomId,
        userId,
        POOL_POSITION,
        'Avvicinati al biliardo',
      );
      if (!player) return;
      if (locationIdFor(player.position) !== '0,0') {
        socket.emit('error', { code: 'WRONG_LOCATION', message: 'Il biliardo e nel bar' });
        return;
      }

      const now = Date.now();
      let current = normalizePoolState(await state.getObjectState(roomId, objectId), now);
      if (poolIsExpired(current, now)) {
        const expired = expiredPoolState(now);
        await emitPoolState(io, roomId, expired);
        current = expired;
        if (action !== 'pool-start-solo' && action !== 'pool-create-duo') {
          socket.emit('error', { code: 'POOL_EXPIRED', message: 'Tempo biliardo scaduto' });
          return;
        }
      }

      if (action === 'pool-start-solo' || action === 'pool-create-duo' || action === 'pool-join-duo') {
        if (current.phase === 'finished' && action !== 'pool-join-duo') {
          current = normalizePoolState(null, now);
        }
        if (poolPlayer(current, userId)) {
          socket.emit('error', { code: 'POOL_ALREADY_JOINED', message: 'Sei gia al tavolo' });
          return;
        }
        if (action !== 'pool-join-duo' && (current.phase === 'playing' || current.phase === 'waiting')) {
          socket.emit('error', { code: 'POOL_BUSY', message: 'Il biliardo e gia occupato' });
          return;
        }
        if (action === 'pool-join-duo' && (current.phase !== 'waiting' || current.mode !== 'duo' || current.players.length !== 1)) {
          socket.emit('error', { code: 'POOL_NOT_WAITING', message: 'Nessuna partita a due in attesa' });
          return;
        }

        const paidUser = await userService.spendPetals(userId, POOL_PLAY_COST, 'pool');
        if (!paidUser) {
          socket.emit('error', { code: 'INSUFFICIENT_PETALS', message: `Servono ${POOL_PLAY_COST} petali` });
          return;
        }
        socket.emit('account-updated', { petals: paidUser.petals, stats: { ...paidUser.stats } });
        logInfo('economy.spend', { userId, source: 'pool', amount: POOL_PLAY_COST, petals: paidUser.petals });

        const joining = { userId, username, joinedAt: now };
        const sessionExpiresAt = now + POOL_PLAY_DURATION_MS;
        const next: PoolState = action === 'pool-start-solo'
          ? {
              ...normalizePoolState(null, now),
              phase: 'playing',
              mode: 'solo',
              players: [joining],
              startedAt: now,
              expiresAt: sessionExpiresAt,
              turnUserId: userId,
              message: `${username} gioca da solo`,
              updatedAt: now,
            }
          : action === 'pool-create-duo'
            ? {
                ...normalizePoolState(null, now),
                phase: 'waiting',
                mode: 'duo',
                players: [joining],
                startedAt: now,
                expiresAt: sessionExpiresAt,
                turnUserId: userId,
                message: `${username} aspetta un avversario`,
                updatedAt: now,
              }
            : {
                ...current,
                phase: 'playing',
                mode: 'duo',
                players: [...current.players, joining],
                startedAt: now,
                expiresAt: sessionExpiresAt,
                turnUserId: current.players[0]?.userId ?? userId,
                message: `${username} entra al tavolo`,
                updatedAt: now,
              };

        await emitPoolState(io, roomId, next);
        return;
      }

      if (action === 'pool-shot') {
        if (current.phase !== 'playing' || !poolPlayer(current, userId)) {
          socket.emit('error', { code: 'POOL_NOT_PLAYING', message: 'Non sei in questa partita' });
          return;
        }
        if (current.turnUserId && current.turnUserId !== userId) {
          socket.emit('error', { code: 'POOL_NOT_YOUR_TURN', message: 'Non e il tuo turno' });
          return;
        }

        const angle = typeof payload.angle === 'number' && Number.isFinite(payload.angle) ? payload.angle : NaN;
        const power = typeof payload.power === 'number' && Number.isFinite(payload.power) ? payload.power : NaN;
        const spin = typeof payload.spin === 'number' && Number.isFinite(payload.spin) ? payload.spin : 0;
        if (!Number.isFinite(angle) || !Number.isFinite(power)) {
          socket.emit('error', { code: 'INVALID_POOL_SHOT', message: 'Tiro non valido' });
          return;
        }

        const next: PoolState = {
          ...current,
          // Keep the turn with the shooter until the shot resolves (pool-sync);
          // traditional rules let a clean pot retain the table.
          turnUserId: userId,
          lastShot: {
            shotId: randomUUID(),
            userId,
            angle: Math.max(-Math.PI * 2, Math.min(Math.PI * 2, angle)),
            power: Math.max(0, Math.min(1, power)),
            spin: Math.max(-1, Math.min(1, spin)),
            createdAt: now,
          },
          message: `${username} tira`,
          updatedAt: now,
        };
        await emitPoolState(io, roomId, next);
        return;
      }

      if (action === 'pool-sync') {
        if (current.phase !== 'playing' || !poolPlayer(current, userId)) return;
        const balls = parsePoolBalls(payload.balls);
        if (!balls) return;
        const scratched = payload.scratched === true;
        const resolution = resolvePoolShot(current, userId, balls, scratched);
        await emitPoolState(io, roomId, {
          ...current,
          phase: resolution.finished ? 'finished' : current.phase,
          balls,
          turnUserId: resolution.nextTurnUserId,
          winnerUserId: resolution.winnerUserId,
          scores: resolution.scores,
          fouls: resolution.fouls,
          lastOutcome: resolution.outcome,
          message: resolution.message,
          updatedAt: now,
        });
        return;
      }

      if (action === 'pool-leave') {
        if (!poolPlayer(current, userId)) return;
        const remaining = current.players.filter((entry) => entry.userId !== userId);
        const next: PoolState = remaining.length === 0
          ? normalizePoolState(null, now)
          : {
              ...current,
              phase: current.mode === 'duo' && remaining.length === 1 ? 'waiting' : current.phase,
              players: remaining,
              turnUserId: remaining[0]?.userId,
              message: `${username} lascia il tavolo`,
              updatedAt: now,
            };
        await emitPoolState(io, roomId, next);
        return;
      }

      socket.emit('error', { code: 'UNKNOWN_INTERACTION', message: 'Azione biliardo sconosciuta' });
      return;
    }

    if (isSeatObjectId(objectId)) {
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
        await persistUserPosition(userId, roomId, position);
        await emitObjectStateChangedToInterested(io, roomId, { objectId, state: next }, roomState.users);
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
          await persistUserPosition(userId, roomId, position);
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
        await emitObjectStateChangedToInterested(io, roomId, { objectId, state: next });
        return;
      }

      socket.emit('error', { code: 'UNKNOWN_INTERACTION', message: 'Azione seduta sconosciuta' });
      return;
    }

    socket.emit('error', { code: 'UNKNOWN_INTERACTION', message: 'Oggetto sconosciuto' });
  });

  socket.on('emote', async ({ emoteId }) => {
    if (!hitSocketRate(socket, 'emote', 20, 10_000)) return;
    const roomId = socket.data.currentRoom;
    if (!roomId || !isEmoteId(emoteId)) return;
    const roomState = await state.getRoomState(roomId);
    const sender = roomState.users.find((user) => user.userId === userId);
    if (sender) await emitEmoteToInterested(io, roomId, sender, emoteId, roomState.users);
  });

  socket.on('chat-message', async ({ text }) => {
    if (!hitSocketRate(socket, 'chat', 8, 10_000)) return;
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
    if (!hitSocketRate(socket, 'hold-item', 20, 10_000)) return;
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
