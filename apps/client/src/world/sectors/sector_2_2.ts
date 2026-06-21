import { SECTOR_SIZE, type DecorationData, type SectorData, type TileData } from '../types';

// Villa Belvedere — a warm games & events hall. Entered from the boulevard (1,2)
// through the west wall (col 0, rows 11-12). Parquet floor, two green felt gaming
// zones with tables, plus benches and a gathering corner.

const FLOOR_A = 0x6a4a30;
const FLOOR_B = 0x735233;
const WALL = 0x2a1d17;
const WALL_TOP = 0x3a2a1d;
const FELT_A = 0x2f7d4a;
const FELT_B = 0x35864f;

const DOOR_ROWS = [11, 12];

// Two felt gaming zones.
const FELT_ZONES: Array<[number, number, number, number]> = [
  [4, 4, 9, 8],   // [minX, minY, maxX, maxY]
  [14, 14, 19, 18],
];

// Furniture tiles that block movement (game tables + gathering bench).
const SOLID_DECORATIONS: Array<[number, number]> = [
  [6, 6], [7, 6], [16, 16], [17, 16],
  [18, 4], [5, 19],
];

const DECORATIONS: DecorationData[] = [
  // North feature wall
  ...Array.from({ length: 20 }, (_, i) => ({ kind: 'barWall' as const, x: i + 2, y: 0, color: 0x3a2a1d, accentColor: 0x6b4a32 })),
  // Game tables on the felt zones
  { kind: 'gardenTable', x: 6, y: 6, variant: 0, color: 0xd8c08a },
  { kind: 'gardenTable', x: 7, y: 6, variant: 1, color: 0xd8c08a },
  { kind: 'gardenTable', x: 16, y: 16, variant: 2, color: 0xd8c08a },
  { kind: 'gardenTable', x: 17, y: 16, variant: 3, color: 0xd8c08a },
  // Stools around the tables
  ...[[5, 7], [8, 7], [6, 5], [15, 17], [18, 17], [16, 15]].map(
    ([x, y], variant) => ({ kind: 'stool' as const, x, y, variant }),
  ),
  // Gathering corner + decor
  { kind: 'table', x: 18, y: 4, variant: 0 },
  { kind: 'bench', x: 5, y: 19, variant: 0 },
  { kind: 'bench', x: 8, y: 19, variant: 1 },
  { kind: 'planter', x: 20, y: 20, variant: 0, accentColor: 0xf2cc5d },
  { kind: 'planter', x: 2, y: 2, variant: 1, accentColor: 0xe85d75 },
  { kind: 'stringLight', x: 7, y: 12, variant: 0 },
  { kind: 'stringLight', x: 16, y: 9, variant: 1 },
];

function isPerimeter(x: number, y: number): boolean {
  return x === 0 || y === 0 || x === SECTOR_SIZE - 1 || y === SECTOR_SIZE - 1;
}

function isFelt(x: number, y: number): boolean {
  return FELT_ZONES.some(([minX, minY, maxX, maxY]) => x >= minX && x <= maxX && y >= minY && y <= maxY);
}

function build(): SectorData {
  const tiles: TileData[][] = [];
  for (let y = 0; y < SECTOR_SIZE; y++) {
    tiles[y] = [];
    for (let x = 0; x < SECTOR_SIZE; x++) {
      if (isPerimeter(x, y)) {
        tiles[y][x] = { walkable: false, color: WALL, topColor: WALL_TOP, detail: 'void' };
      } else if (isFelt(x, y)) {
        tiles[y][x] = {
          walkable: true,
          color: (x + y) % 2 === 0 ? FELT_A : FELT_B,
          detail: 'stone',
          accentColor: 0x9fe0b3,
        };
      } else {
        tiles[y][x] = {
          walkable: true,
          color: (x + y) % 2 === 0 ? FLOOR_A : FLOOR_B,
          detail: 'wood',
          accentColor: 0x8a6a44,
        };
      }
    }
  }

  // West doorway from the boulevard.
  for (const y of DOOR_ROWS) {
    tiles[y][0] = { walkable: true, color: FLOOR_A, detail: 'wood', accentColor: 0x8a6a44 };
  }

  for (const [x, y] of SOLID_DECORATIONS) {
    tiles[y][x] = { ...tiles[y][x], walkable: false };
  }

  return { sx: 2, sy: 2, tiles, decorations: DECORATIONS };
}

export const sector: SectorData = build();
