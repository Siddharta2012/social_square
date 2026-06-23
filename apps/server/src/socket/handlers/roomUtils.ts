import {
  Direction,
  INTERACTION_RADIUS_TILES,
  isPositionInInterestRange,
  isWithinInteractionRange,
  positionToSector,
} from '@social-square/shared';
import { logWarn } from '../../utils/logger';
import { socketRateLimiter } from '../../utils/rateLimit';
import { state, userService, type IoSocket, type RoomUser } from './roomContext';
import type {
  AvatarConfig,
  AvatarState,
  EmoteId,
  HeldItem,
  ObjectState,
  Position,
} from '@social-square/shared';
import type { z } from 'zod';

const EMOTE_IDS = new Set<EmoteId>(['wave', 'dance', 'clap']);
const AVATAR_STATES = new Set<AvatarState>([
  'idle',
  'walk',
  'sit',
  'wave',
  'dance',
  'clap',
  'fish',
]);

export const DIRECTIONS = new Set<number>(
  Object.values(Direction).filter((value): value is number => typeof value === 'number'),
);

function numberFromState(value: ObjectState | undefined, key: string): number | null {
  const raw = value?.[key];
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : null;
}

export function seatPositionFrom(value: ObjectState | undefined): Position | null {
  const x = numberFromState(value, 'x');
  const y = numberFromState(value, 'y');
  return x === null || y === null ? null : { x, y };
}

export function isEmoteId(value: unknown): value is EmoteId {
  return typeof value === 'string' && EMOTE_IDS.has(value as EmoteId);
}

export function isAvatarState(value: unknown): value is AvatarState {
  return typeof value === 'string' && AVATAR_STATES.has(value as AvatarState);
}

export function usersById(users: RoomUser[]): Map<string, RoomUser> {
  return new Map(users.map((user) => [user.userId, user]));
}

export function canSeeUser(viewer: RoomUser, target: Pick<RoomUser, 'position'>): boolean {
  return isPositionInInterestRange(viewer.position, target.position);
}

export function changedSector(a: Position, b: Position): boolean {
  const sectorA = positionToSector(a);
  const sectorB = positionToSector(b);
  return sectorA.sx !== sectorB.sx || sectorA.sy !== sectorB.sy;
}

export function locationIdFor(position: Position): string {
  const sector = positionToSector(position);
  return `${sector.sx},${sector.sy}`;
}

export function isHeldItem(value: unknown): value is Exclude<HeldItem, null> {
  return value === 'beer' || value === 'pretzel';
}

export async function currentRoomUser(roomId: string, userId: string): Promise<RoomUser | null> {
  const roomState = await state.getRoomState(roomId);
  return roomState.users.find((user) => user.userId === userId) ?? null;
}

function positionHintFromPayload(payload: ObjectState | undefined): Position | null {
  const x = payload?.playerX;
  const y = payload?.playerY;
  if (typeof x !== 'number' || typeof y !== 'number') return null;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x, y };
}

export async function currentRoomUserForInteraction(
  roomId: string,
  userId: string,
  payload?: ObjectState,
): Promise<RoomUser | null> {
  const user = await currentRoomUser(roomId, userId);
  if (!user) return null;
  const hintedPosition = positionHintFromPayload(payload);
  if (!hintedPosition) return user;
  // Use the hint for proximity checks only — the authoritative position is
  // updated via the throttled 'move' channel which the client fires before
  // each interaction. Writing back the client hint would let clients
  // teleport their server-side position through interaction payloads.
  return { ...user, position: hintedPosition };
}

export function emitTooFar(socket: IoSocket, message: string): void {
  socket.emit('error', { code: 'TOO_FAR', message });
}

export function socketRateKey(socket: IoSocket, bucket: string): string {
  return `socket:${bucket}:${socket.data.userId}:${socket.id}`;
}

export async function hitSocketRate(
  socket: IoSocket,
  bucket: string,
  limit: number,
  windowMs: number,
): Promise<boolean> {
  const result = await socketRateLimiter.hitShared(socketRateKey(socket, bucket), limit, windowMs);
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

export function parseSocketPayload<T extends z.ZodTypeAny>(
  socket: IoSocket,
  schema: T,
  value: unknown,
): z.infer<T> | null {
  const parsed = schema.safeParse(value);
  if (parsed.success) return parsed.data;
  socket.emit('error', { code: 'INVALID_PAYLOAD', message: 'Richiesta non valida' });
  return null;
}

export function isSafeEventText(value: unknown, maxLength = 80): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= maxLength;
}

function safeAvatarPart(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
}

export function sanitizeAvatarConfig(
  value: unknown,
  userId: string,
  username: string,
): AvatarConfig {
  const raw = value && typeof value === 'object' ? (value as Partial<AvatarConfig>) : {};
  return {
    userId,
    username,
    body: safeAvatarPart(raw.body),
    outfit: safeAvatarPart(raw.outfit),
    hair: safeAvatarPart(raw.hair),
    hairColor:
      typeof raw.hairColor === 'string' && /^#[0-9a-fA-F]{6}$/.test(raw.hairColor)
        ? raw.hairColor
        : '#4488ff',
    accessory: safeAvatarPart(raw.accessory),
    expression: safeAvatarPart(raw.expression),
  };
}

export function sanitizeSocketPayload(value: unknown): ObjectState {
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

export async function ensureUserNear(
  socket: IoSocket,
  roomId: string,
  userId: string,
  target: Position,
  message: string,
  payload?: ObjectState,
): Promise<RoomUser | null> {
  const user = await currentRoomUserForInteraction(roomId, userId, payload);
  if (!user || !isWithinInteractionRange(user.position, target, INTERACTION_RADIUS_TILES)) {
    emitTooFar(socket, message);
    return null;
  }
  return user;
}

export async function persistUserPosition(
  userId: string,
  roomId: string,
  position: Position,
): Promise<void> {
  await userService.updatePosition(userId, {
    roomId,
    x: position.x,
    y: position.y,
    locationId: locationIdFor(position),
    updatedAt: Date.now(),
  });
}

export async function savedSpawnFor(
  userId: string,
  roomId: string,
  fallback: Position,
): Promise<Position> {
  const user = await userService.findById(userId);
  if (!user?.position || user.position.roomId !== roomId) return fallback;
  return { x: user.position.x, y: user.position.y };
}
