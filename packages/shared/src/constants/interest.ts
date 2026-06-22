import { JUKEBOX_OBJECT_ID, JUKEBOX_POSITION, SEAT_DEFINITIONS, isSeatObjectId } from './interactions';
import { POOL_OBJECT_ID, POOL_POSITION } from './pool';
import { WAITER_OBJECT_ID, normalizeWaiterState } from './waiter';
import type { ObjectState, Position } from '../types/events';

/** Must match the client world sector size. */
export const WORLD_SECTOR_SIZE = 24;

/** Users receive presence/audio context only for their current screen-sized location. */
export const INTEREST_RADIUS_SECTORS = 0;

export interface SectorCoordinate {
  sx: number;
  sy: number;
}

export interface ObjectStateSnapshot {
  objectId: string;
  state: ObjectState;
}

export type ObjectInterestScope = 'room' | 'location' | 'personal';

export function positionToSector(
  position: Position,
  sectorSize = WORLD_SECTOR_SIZE,
): SectorCoordinate {
  return {
    sx: Math.floor(position.x / sectorSize),
    sy: Math.floor(position.y / sectorSize),
  };
}

export function sectorDistance(a: SectorCoordinate, b: SectorCoordinate): number {
  return Math.max(Math.abs(a.sx - b.sx), Math.abs(a.sy - b.sy));
}

export function isPositionInInterestRange(
  viewer: Position,
  target: Position,
  radius = INTEREST_RADIUS_SECTORS,
  sectorSize = WORLD_SECTOR_SIZE,
): boolean {
  return sectorDistance(positionToSector(viewer, sectorSize), positionToSector(target, sectorSize)) <= radius;
}

export function filterUsersByInterest<T extends { userId: string; position: Position }>(
  viewer: T,
  users: readonly T[],
  radius = INTEREST_RADIUS_SECTORS,
  sectorSize = WORLD_SECTOR_SIZE,
): T[] {
  return users.filter((user) => (
    user.userId === viewer.userId ||
    isPositionInInterestRange(viewer.position, user.position, radius, sectorSize)
  ));
}

const SEAT_POSITIONS = new Map<string, Position>(
  SEAT_DEFINITIONS.map((seat) => [seat.id, { x: seat.x, y: seat.y }]),
);

function numberFromState(value: ObjectState, key: string): number | null {
  const raw = value[key];
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : null;
}

function statePosition(value: ObjectState): Position | null {
  const x = numberFromState(value, 'x');
  const y = numberFromState(value, 'y');
  return x === null || y === null ? null : { x, y };
}

function objectHasPersonalInterest(
  viewer: { userId: string },
  object: ObjectStateSnapshot,
): boolean {
  if (object.state.occupiedBy === viewer.userId) return true;
  if (object.objectId !== WAITER_OBJECT_ID) return false;
  return normalizeWaiterState(object.state).customerId === viewer.userId;
}

export function objectInterestScope(object: ObjectStateSnapshot): ObjectInterestScope {
  if (object.state.occupiedBy) return 'personal';
  if (object.objectId === WAITER_OBJECT_ID && normalizeWaiterState(object.state).customerId) return 'personal';
  return 'location';
}

export function objectInterestPosition(object: ObjectStateSnapshot): Position | null {
  if (isSeatObjectId(object.objectId)) return SEAT_POSITIONS.get(object.objectId) ?? statePosition(object.state);
  if (object.objectId === WAITER_OBJECT_ID) {
    const waiter = normalizeWaiterState(object.state);
    return { x: waiter.x, y: waiter.y };
  }
  if (object.objectId === JUKEBOX_OBJECT_ID) return JUKEBOX_POSITION;
  if (object.objectId === POOL_OBJECT_ID) return POOL_POSITION;
  return statePosition(object.state);
}

export function isObjectVisibleToViewer(
  viewer: { userId: string; position: Position },
  object: ObjectStateSnapshot,
  radius = INTEREST_RADIUS_SECTORS,
  sectorSize = WORLD_SECTOR_SIZE,
): boolean {
  if (objectHasPersonalInterest(viewer, object)) return true;

  const position = objectInterestPosition(object);
  if (!position) return true;
  return isPositionInInterestRange(viewer.position, position, radius, sectorSize);
}

export function filterObjectsByInterest<T extends ObjectStateSnapshot>(
  viewer: { userId: string; position: Position },
  objects: readonly T[],
  radius = INTEREST_RADIUS_SECTORS,
  sectorSize = WORLD_SECTOR_SIZE,
): T[] {
  return objects.filter((object) => isObjectVisibleToViewer(viewer, object, radius, sectorSize));
}
