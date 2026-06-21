import { SECTOR_SIZE, type DecorationData, type SectorData, type TileData } from '../types';

const GRASS_A = 0x3f6f3a;
const GRASS_B = 0x477a40;
const PATH = 0x8a7a55;
const HEDGE = 0x274d24;

const SOLID_DECORATIONS: Array<[number, number]> = [
  [3, 7], [17, 6], [20, 15], [5, 18],
  [15, 12], [6, 13], [18, 19],
];

const DECORATIONS: DecorationData[] = [
  { kind: 'tree', x: 3, y: 7, variant: 0 },
  { kind: 'tree', x: 17, y: 6, variant: 1, color: 0x2f7446, accentColor: 0x5ea85b },
  { kind: 'tree', x: 20, y: 15, variant: 2, color: 0x28633a, accentColor: 0x66a95c },
  { kind: 'shrub', x: 5, y: 18, variant: 0 },
  { kind: 'shrub', x: 2, y: 15, variant: 1 },
  { kind: 'shrub', x: 21, y: 9, variant: 2 },
  { kind: 'bench', x: 7, y: 8, variant: 0 },
  { kind: 'bench', x: 12, y: 17, variant: 1 },
  { kind: 'umbrella', x: 15, y: 12, variant: 0, color: 0xd94f5c },
  { kind: 'umbrella', x: 6, y: 13, variant: 1, color: 0x4d9de0 },
  { kind: 'gardenTable', x: 15, y: 13, variant: 0 },
  { kind: 'gardenTable', x: 6, y: 14, variant: 1 },
  { kind: 'gardenTable', x: 18, y: 19, variant: 2 },
  { kind: 'stringLight', x: 8, y: 6, variant: 0 },
  { kind: 'stringLight', x: 13, y: 8, variant: 1 },
  { kind: 'stringLight', x: 19, y: 11, variant: 2 },
  ...[
    [3, 11], [4, 12], [12, 6], [14, 7], [11, 19], [20, 18],
  ].map(([x, y], variant) => ({ kind: 'flowerPatch' as const, x, y, variant })),
  ...[
    [1, 4], [5, 5], [12, 3], [18, 4], [22, 6], [4, 20], [9, 18], [14, 21], [21, 20],
  ].map(([x, y], variant) => ({ kind: 'grassTuft' as const, x, y, variant })),
];

function build(): SectorData {
  const tiles: TileData[][] = [];
  for (let y = 0; y < SECTOR_SIZE; y++) {
    tiles[y] = [];
    for (let x = 0; x < SECTOR_SIZE; x++) {
      tiles[y][x] = {
        walkable: true,
        color: (x + y) % 2 === 0 ? GRASS_A : GRASS_B,
        detail: 'grass',
        accentColor: 0x6bb758,
      };
    }
  }

  for (let y = 0; y < 8; y++) {
    tiles[y][9] = { walkable: true, color: PATH, detail: 'path', accentColor: 0xb8aa7a };
    tiles[y][10] = { walkable: true, color: PATH, detail: 'path', accentColor: 0xb8aa7a };
  }
  for (let y = 8; y < 22; y++) {
    if (y % 2 === 0) {
      tiles[y][10] = { walkable: true, color: PATH, detail: 'path', accentColor: 0xb8aa7a };
      tiles[y][11] = { walkable: true, color: PATH, detail: 'path', accentColor: 0xb8aa7a };
    }
  }
  for (let x = 7; x < SECTOR_SIZE; x++) {
    tiles[13][x] = { walkable: true, color: PATH, detail: 'path', accentColor: 0xb8aa7a };
  }

  for (let x = 0; x < SECTOR_SIZE; x++) {
    tiles[SECTOR_SIZE - 1][x] = {
      walkable: false,
      color: HEDGE,
      topColor: 0x376d30,
      detail: 'hedge',
      accentColor: 0x5f9a48,
    };
  }

  for (const [x, y] of SOLID_DECORATIONS) {
    tiles[y][x] = { ...tiles[y][x], walkable: false };
  }

  return { sx: 0, sy: 1, tiles, decorations: DECORATIONS };
}

export const sector: SectorData = build();
