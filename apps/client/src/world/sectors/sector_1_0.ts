import { SECTOR_SIZE, type DecorationData, type SectorData, type TileData } from '../types';

const GRASS_A = 0x3f6f3a;
const GRASS_B = 0x477a40;
const ROAD_A = 0x5f6972;
const ROAD_B = 0x6b747d;
const PAVEMENT = 0x7d817c;
const BUILDING = 0x4f4039;

const SOLID_DECORATIONS: Array<[number, number]> = [
  [4, 5], [4, 14], [18, 5], [19, 14],
  [6, 18], [17, 18],
];

const DECORATIONS: DecorationData[] = [
  { kind: 'shopFront', x: 4, y: 5, variant: 0, color: 0x77614f, accentColor: 0xd94f5c },
  { kind: 'shopFront', x: 4, y: 14, variant: 1, color: 0x6f7563, accentColor: 0xf2cc5d },
  { kind: 'shopFront', x: 18, y: 5, variant: 2, color: 0x6b5a70, accentColor: 0x4d9de0 },
  { kind: 'shopFront', x: 19, y: 14, variant: 3, color: 0x765b50, accentColor: 0xe85d75 },
  { kind: 'streetLamp', x: 8, y: 7, variant: 0 },
  { kind: 'streetLamp', x: 14, y: 7, variant: 1 },
  { kind: 'streetLamp', x: 8, y: 16, variant: 2 },
  { kind: 'streetLamp', x: 14, y: 16, variant: 3 },
  { kind: 'signpost', x: 11, y: 21, variant: 0 },
  { kind: 'planter', x: 6, y: 18, variant: 0, accentColor: 0xf2cc5d },
  { kind: 'planter', x: 17, y: 18, variant: 1, accentColor: 0x9b7cff },
  { kind: 'marketStall', x: 20, y: 12, variant: 2, color: 0xf2cc5d },
];

function isRoad(x: number, y: number): boolean {
  return (x >= 9 && x <= 12) || (y >= 11 && y <= 13);
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
      if (isRoad(x, y)) {
        tiles[y][x] = {
          walkable: true,
          color: (x + y) % 2 === 0 ? ROAD_A : ROAD_B,
          detail: 'stone',
          accentColor: 0x9da7ae,
        };
      } else if ((x >= 3 && x <= 20 && (y === 6 || y === 15)) || (y >= 10 && y <= 14 && (x === 8 || x === 13))) {
        tiles[y][x] = { walkable: true, color: PAVEMENT, detail: 'stone', accentColor: 0xa8aca5 };
      }
    }
  }

  for (const [x, y] of SOLID_DECORATIONS) {
    tiles[y][x] = { walkable: false, color: BUILDING, topColor: 0x6a5a50, detail: 'stone' };
  }

  return { sx: 1, sy: 0, tiles, decorations: DECORATIONS };
}

export const sector: SectorData = build();
