import { SECTOR_SIZE, type DecorationData, type SectorData, type TileData } from '../types';

const GRASS_A = 0x416f3d;
const GRASS_B = 0x4a7a44;
const PATH = 0x8a7a55;
const LANE_A = 0x68737d;
const LANE_B = 0x747f89;
const HEDGE = 0x274d24;
const BUILDING = 0x4f4039;

const SOLID_DECORATIONS: Array<[number, number]> = [
  [5, 6],
  [18, 7],
  [5, 18],
  [19, 18],
  [14, 13],
];

const DECORATIONS: DecorationData[] = [
  { kind: 'shopFront', x: 5, y: 6, variant: 0, color: 0x746858, accentColor: 0xf2cc5d },
  { kind: 'shopFront', x: 18, y: 7, variant: 1, color: 0x6f7563, accentColor: 0x7dd3fc },
  { kind: 'shopFront', x: 5, y: 18, variant: 2, color: 0x765b50, accentColor: 0xe85d75 },
  { kind: 'shopFront', x: 19, y: 18, variant: 3, color: 0x6b5a70, accentColor: 0x9b7cff },
  { kind: 'well', x: 14, y: 13, variant: 0, color: 0x7f8a91, accentColor: 0x8a4b2a },
  { kind: 'streetLamp', x: 8, y: 10, variant: 0 },
  { kind: 'streetLamp', x: 16, y: 10, variant: 1 },
  { kind: 'streetLamp', x: 8, y: 16, variant: 2 },
  { kind: 'streetLamp', x: 16, y: 16, variant: 3 },
  { kind: 'bench', x: 12, y: 17, variant: 0 },
  { kind: 'signpost', x: 2, y: 13, variant: 0 },
  { kind: 'planter', x: 4, y: 10, variant: 0, accentColor: 0xf2cc5d },
  { kind: 'planter', x: 20, y: 11, variant: 1, accentColor: 0xe85d75 },
  { kind: 'tree', x: 21, y: 4, variant: 0, color: 0x2f7d3c, accentColor: 0x4a9a48 },
  { kind: 'shrub', x: 21, y: 21, variant: 1, color: 0x2d6b32, accentColor: 0x62a85c },
  ...[
    [3, 16], [12, 8], [18, 14], [20, 20],
  ].map(([x, y], variant) => ({ kind: 'flowerPatch' as const, x, y, variant })),
];

function isLane(x: number, y: number): boolean {
  return y >= 12 && y <= 14 || x >= 10 && x <= 11;
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
    if (x < 10 || x > 11) {
      tiles[0][x] = { walkable: false, color: HEDGE, topColor: 0x376d30, detail: 'hedge', accentColor: 0x5f9a48 };
      tiles[SECTOR_SIZE - 1][x] = { walkable: false, color: HEDGE, topColor: 0x376d30, detail: 'hedge', accentColor: 0x5f9a48 };
    }
  }
  for (let y = 0; y < SECTOR_SIZE; y++) {
    if (y < 12 || y > 14) {
      tiles[y][0] = { walkable: false, color: HEDGE, topColor: 0x376d30, detail: 'hedge', accentColor: 0x5f9a48 };
      tiles[y][SECTOR_SIZE - 1] = { walkable: false, color: HEDGE, topColor: 0x376d30, detail: 'hedge', accentColor: 0x5f9a48 };
    }
  }

  for (let y = 0; y < SECTOR_SIZE; y++) {
    for (let x = 0; x < SECTOR_SIZE; x++) {
      if (!isLane(x, y)) continue;
      tiles[y][x] = {
        walkable: true,
        color: y >= 12 && y <= 14 ? PATH : ((x + y) % 2 === 0 ? LANE_A : LANE_B),
        detail: y >= 12 && y <= 14 ? 'path' : 'stone',
        accentColor: y >= 12 && y <= 14 ? 0xb8aa7a : 0x9da7ae,
      };
    }
  }

  for (const [x, y] of SOLID_DECORATIONS) {
    tiles[y][x] = { ...tiles[y][x], walkable: false, color: BUILDING, topColor: 0x6a5a50 };
  }

  return { sx: 2, sy: 1, tiles, decorations: DECORATIONS };
}

export const sector: SectorData = build();
