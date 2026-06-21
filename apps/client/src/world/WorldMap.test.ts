import { describe, expect, it } from 'vitest';
import { WorldMap } from './WorldMap';
import { SECTOR_SIZE, type SectorData, type TileData } from './types';

function solidSector(sx: number, sy: number, walkable: boolean): SectorData {
  const tiles: TileData[][] = [];
  for (let y = 0; y < SECTOR_SIZE; y++) {
    tiles[y] = [];
    for (let x = 0; x < SECTOR_SIZE; x++) {
      tiles[y][x] = { walkable, color: 0x000000 };
    }
  }
  return { sx, sy, tiles };
}

describe('WorldMap', () => {
  it('returns not-walkable for tiles in unloaded sectors', () => {
    const map = new WorldMap();
    expect(map.isWalkable(0, 0)).toBe(false);
    expect(map.getTile(0, 0)).toBeNull();
  });

  it('reads walkability from a loaded sector in global coords', () => {
    const map = new WorldMap();
    map.setSector(solidSector(0, 0, true));
    expect(map.isWalkable(5, 5)).toBe(true);
    expect(map.getTile(5, 5)?.walkable).toBe(true);
  });

  it('resolves the correct sector for global coords beyond the first sector', () => {
    const map = new WorldMap();
    map.setSector(solidSector(0, 1, true));
    expect(map.isWalkable(3, SECTOR_SIZE + 2)).toBe(true);
    expect(map.isWalkable(3, 2)).toBe(false);
  });

  it('removes a sector', () => {
    const map = new WorldMap();
    map.setSector(solidSector(0, 0, true));
    map.removeSector(0, 0);
    expect(map.isWalkable(5, 5)).toBe(false);
  });
});
