import { SECTOR_SIZE, type DecorationData, type SectorData, type TileData } from '../types';

const GRASS_A = 0x426f3d;
const GRASS_B = 0x4c7846;
const ROAD_A = 0x5f6972;
const ROAD_B = 0x6b747d;
const PAVEMENT = 0x7d817c;
const WATER_A = 0x2f6f8e;
const WATER_B = 0x357c9d;
const BRIDGE = 0x8a6442;
const BUILDING = 0x4f4039;

const SOLID_DECORATIONS: Array<[number, number]> = [
  [5, 5],
  [14, 5],
  [5, 18],
  [15, 18],
  [14, 16],
];

const DECORATIONS: DecorationData[] = [
  { kind: 'shopFront', x: 5, y: 5, variant: 0, color: 0x6f7563, accentColor: 0xf2cc5d },
  { kind: 'shopFront', x: 14, y: 5, variant: 1, color: 0x77614f, accentColor: 0x4d9de0 },
  { kind: 'shopFront', x: 5, y: 18, variant: 2, color: 0x6b5a70, accentColor: 0xe85d75 },
  { kind: 'marketStall', x: 15, y: 18, variant: 0, color: 0x5aa9e6 },
  { kind: 'streetLamp', x: 8, y: 10, variant: 0 },
  { kind: 'streetLamp', x: 14, y: 10, variant: 1 },
  { kind: 'streetLamp', x: 8, y: 21, variant: 2 },
  { kind: 'streetLamp', x: 14, y: 21, variant: 3 },
  { kind: 'bench', x: 18, y: 8, variant: 0, color: 0x8a5a35 },
  { kind: 'bench', x: 18, y: 18, variant: 1, color: 0x8a5a35 },
  { kind: 'signpost', x: 2, y: 12, variant: 0 },
  { kind: 'planter', x: 14, y: 16, variant: 0, accentColor: 0x9b7cff },
  { kind: 'tree', x: 21, y: 4, variant: 0, color: 0x2f7d3c, accentColor: 0x4a9a48 },
  { kind: 'tree', x: 21, y: 20, variant: 1, color: 0x326f45, accentColor: 0x62a85c },
  ...[
    [3, 9], [3, 15], [13, 8], [13, 20],
  ].map(([x, y], variant) => ({ kind: 'flowerPatch' as const, x, y, variant })),
];

function isRoad(x: number, y: number): boolean {
  return (y >= 11 && y <= 13 && x <= 16) || (x >= 10 && x <= 11 && y >= 11);
}

function isPromenade(x: number, y: number): boolean {
  return x >= 14 && x <= 16 && y >= 4 && y <= 20;
}

function isWater(x: number): boolean {
  return x >= 17;
}

function isBridge(x: number, y: number): boolean {
  return x >= 17 && y === 12;
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

  for (let y = 0; y < SECTOR_SIZE; y++) {
    for (let x = 0; x < SECTOR_SIZE; x++) {
      if (isWater(x)) {
        tiles[y][x] = {
          walkable: false,
          color: (x + y) % 2 === 0 ? WATER_A : WATER_B,
          detail: 'water',
          accentColor: 0x8fd6f0,
        };
      }
      if (isBridge(x, y)) {
        tiles[y][x] = {
          walkable: true,
          color: BRIDGE,
          detail: 'wood',
          accentColor: 0xc49a68,
        };
      } else if (isRoad(x, y)) {
        tiles[y][x] = {
          walkable: true,
          color: (x + y) % 2 === 0 ? ROAD_A : ROAD_B,
          detail: 'stone',
          accentColor: 0x9da7ae,
        };
      } else if (isPromenade(x, y)) {
        tiles[y][x] = {
          walkable: true,
          color: PAVEMENT,
          detail: 'stone',
          accentColor: 0xa8aca5,
        };
      }
    }
  }

  for (const [x, y] of SOLID_DECORATIONS) {
    tiles[y][x] = { walkable: false, color: BUILDING, topColor: 0x6a5a50, detail: 'stone' };
  }

  return { sx: 2, sy: 0, tiles, decorations: DECORATIONS };
}

export const sector: SectorData = build();
