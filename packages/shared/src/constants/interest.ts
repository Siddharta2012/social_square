import type { Position } from '../types/events';

/** Must match the client world sector size. */
export const WORLD_SECTOR_SIZE = 24;

/** Users receive presence updates for their own sector plus the surrounding ring. */
export const INTEREST_RADIUS_SECTORS = 1;

export interface SectorCoordinate {
  sx: number;
  sy: number;
}

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
