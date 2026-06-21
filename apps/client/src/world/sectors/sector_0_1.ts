import { SECTOR_SIZE, type SectorData, type TileData } from '../types';

const GRASS_A = 0x3f6f3a;
const GRASS_B = 0x477a40;
const PATH = 0x8a7a55;
const HEDGE = 0x274d24;

function build(): SectorData {
  const tiles: TileData[][] = [];
  for (let y = 0; y < SECTOR_SIZE; y++) {
    tiles[y] = [];
    for (let x = 0; x < SECTOR_SIZE; x++) {
      tiles[y][x] = { walkable: true, color: (x + y) % 2 === 0 ? GRASS_A : GRASS_B };
    }
  }

  for (let y = 0; y < 8; y++) {
    tiles[y][9] = { walkable: true, color: PATH };
    tiles[y][10] = { walkable: true, color: PATH };
  }

  for (let x = 0; x < SECTOR_SIZE; x++) {
    tiles[SECTOR_SIZE - 1][x] = { walkable: false, color: HEDGE, topColor: HEDGE };
  }

  return { sx: 0, sy: 1, tiles };
}

export const sector: SectorData = build();
