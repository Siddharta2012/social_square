import { SECTOR_SIZE, type DecorationData, type SectorData, type TileData } from '../types';

const GRASS_A = 0x426f3d;
const GRASS_B = 0x4a7a44;
const PATH = 0x8a7a55;
const PLAZA_A = 0x66707a;
const PLAZA_B = 0x727d87;
const HEDGE = 0x274d24;

const SOLID_DECORATIONS: Array<[number, number]> = [
  [12, 12],
  [5, 8],
  [18, 16],
  [6, 4],
  [15, 4],
  [21, 4],
  [4, 19],
  [20, 20],
];

const DECORATIONS: DecorationData[] = [
  { kind: 'fountain', x: 12, y: 12, variant: 0 },
  { kind: 'marketStall', x: 5, y: 8, variant: 0, color: 0xd94f5c },
  { kind: 'marketStall', x: 18, y: 16, variant: 1, color: 0x4d9de0 },
  { kind: 'shopFront', x: 6, y: 4, variant: 0, color: 0x7c6752, accentColor: 0xd94f5c },
  { kind: 'shopFront', x: 15, y: 4, variant: 1, color: 0x6f7563, accentColor: 0x4d9de0 },
  { kind: 'shopFront', x: 21, y: 4, variant: 2, color: 0x7a6055, accentColor: 0xf2cc5d },
  { kind: 'streetLamp', x: 8, y: 10, variant: 0 },
  { kind: 'streetLamp', x: 17, y: 10, variant: 1 },
  { kind: 'streetLamp', x: 8, y: 18, variant: 2 },
  { kind: 'streetLamp', x: 17, y: 18, variant: 3 },
  { kind: 'signpost', x: 2, y: 13, variant: 0 },
  { kind: 'planter', x: 4, y: 19, variant: 0, accentColor: 0xf2cc5d },
  { kind: 'planter', x: 20, y: 20, variant: 1, accentColor: 0xe85d75 },
  { kind: 'bench', x: 10, y: 18, variant: 2 },
  { kind: 'bench', x: 15, y: 18, variant: 3 },
  ...[
    [3, 10], [20, 9], [4, 15], [21, 14],
  ].map(([x, y], variant) => ({ kind: 'flowerPatch' as const, x, y, variant })),
];

function plazaTile(x: number, y: number): boolean {
  const dx = Math.abs(x - 12);
  const dy = Math.abs(y - 13);
  return dx + dy <= 8 || (x >= 7 && x <= 17 && y >= 9 && y <= 18);
}

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

  for (let x = 0; x < SECTOR_SIZE; x++) {
    tiles[0][x] = { walkable: false, color: HEDGE, topColor: 0x376d30, detail: 'hedge', accentColor: 0x5f9a48 };
    tiles[SECTOR_SIZE - 1][x] = { walkable: false, color: HEDGE, topColor: 0x376d30, detail: 'hedge', accentColor: 0x5f9a48 };
  }
  for (let y = 0; y < SECTOR_SIZE; y++) {
    tiles[y][SECTOR_SIZE - 1] = { walkable: false, color: HEDGE, topColor: 0x376d30, detail: 'hedge', accentColor: 0x5f9a48 };
  }

  for (let y = 0; y < SECTOR_SIZE; y++) {
    for (let x = 0; x < SECTOR_SIZE; x++) {
      if (!plazaTile(x, y)) continue;
      tiles[y][x] = {
        walkable: true,
        color: (x + y) % 2 === 0 ? PLAZA_A : PLAZA_B,
        detail: 'stone',
        accentColor: 0x9da7ae,
      };
    }
  }

  for (let x = 0; x < SECTOR_SIZE; x++) {
    tiles[13][x] = { walkable: true, color: PATH, detail: 'path', accentColor: 0xb8aa7a };
  }
  for (let y = 0; y <= 13; y++) {
    tiles[y][10] = { walkable: true, color: PATH, detail: 'path', accentColor: 0xb8aa7a };
    tiles[y][11] = { walkable: true, color: PATH, detail: 'path', accentColor: 0xb8aa7a };
  }
  for (let x = 0; x < SECTOR_SIZE; x++) {
    if (x >= 10 && x <= 11) continue;
    tiles[0][x] = { walkable: false, color: HEDGE, topColor: 0x376d30, detail: 'hedge', accentColor: 0x5f9a48 };
  }

  for (const [x, y] of SOLID_DECORATIONS) {
    tiles[y][x] = { ...tiles[y][x], walkable: false };
  }

  return { sx: 1, sy: 1, tiles, decorations: DECORATIONS };
}

export const sector: SectorData = build();
