import { SECTOR_SIZE } from './types';

export function sectorKey(sx: number, sy: number): string {
  return `${sx},${sy}`;
}

export function globalToSector(g: number): number {
  return Math.floor(g / SECTOR_SIZE);
}

/** Local coordinate within a sector, always in [0, SECTOR_SIZE). */
export function toLocal(g: number): number {
  return ((g % SECTOR_SIZE) + SECTOR_SIZE) % SECTOR_SIZE;
}

/** Keys of all sectors within `radius` (Chebyshev) of the center sector. */
export function computeActiveSet(cx: number, cy: number, radius: number): string[] {
  const keys: string[] = [];
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      keys.push(sectorKey(cx + dx, cy + dy));
    }
  }
  return keys;
}
