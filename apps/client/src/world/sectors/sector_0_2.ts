import { SECTOR_SIZE, type DecorationData, type SectorData, type TileData } from '../types';

// Villa Aurora — a spacious lounge / dance club. Entered from the boulevard (1,2)
// through the east wall (col 23, rows 11-12). Neon dance floor in the centre,
// a drink bar along the north wall, lounge seating in the corners.

const FLOOR_A = 0x241b30;
const FLOOR_B = 0x2c2138;
const WALL = 0x171120;
const WALL_TOP = 0x281c3a;
const NEON_A = 0xc23bd0;
const NEON_B = 0x36c5d6;
const COUNTER = 0x4a2d52;

const DOOR_ROWS = [11, 12];
const DANCE_MIN_X = 8;
const DANCE_MAX_X = 15;
const DANCE_MIN_Y = 7;
const DANCE_MAX_Y = 15;

// Furniture tiles that block movement (counter + lounge tables).
const SOLID_DECORATIONS: Array<[number, number]> = [
  [3, 1], [4, 1], [5, 1], [6, 1], // drink bar counter
  [18, 2],                         // jukebox
  [3, 18], [4, 18], [19, 18], [20, 6],
];

const DECORATIONS: DecorationData[] = [
  // North feature wall
  ...Array.from({ length: 20 }, (_, i) => ({ kind: 'barWall' as const, x: i + 2, y: 0, color: 0x2a1b3a, accentColor: 0x6f3aa0 })),
  // Drink bar along the north wall
  ...[3, 4, 5, 6].map((x) => ({ kind: 'barCounter' as const, x, y: 1, color: COUNTER })),
  { kind: 'bottleShelf', x: 3, y: 0, variant: 1 },
  { kind: 'bottleShelf', x: 5, y: 0, variant: 3 },
  // Stools at the bar
  ...[3, 4, 5, 6].map((x, variant) => ({ kind: 'stool' as const, x, y: 2, variant, color: 0x6f3aa0 })),
  // Jukebox (visual; functional audio wired in the functionality pass)
  { kind: 'jukebox', x: 18, y: 2, accentColor: 0xff5d9d },
  // Lounge seating in the corners
  { kind: 'table', x: 3, y: 18, variant: 0, color: 0x4a2d52 },
  { kind: 'table', x: 19, y: 18, variant: 1, color: 0x4a2d52 },
  { kind: 'table', x: 20, y: 6, variant: 2, color: 0x4a2d52 },
  ...[[2, 17], [4, 17], [3, 19], [18, 17], [20, 17], [19, 19], [19, 6], [21, 6]].map(
    ([x, y], variant) => ({ kind: 'stool' as const, x, y, variant, color: 0x6f3aa0 }),
  ),
  // Festive string lights over the dance floor
  { kind: 'stringLight', x: 9, y: 6, variant: 0 },
  { kind: 'stringLight', x: 14, y: 6, variant: 1 },
  { kind: 'stringLight', x: 11, y: 15, variant: 2 },
];

function isPerimeter(x: number, y: number): boolean {
  return x === 0 || y === 0 || x === SECTOR_SIZE - 1 || y === SECTOR_SIZE - 1;
}

function isDanceFloor(x: number, y: number): boolean {
  return x >= DANCE_MIN_X && x <= DANCE_MAX_X && y >= DANCE_MIN_Y && y <= DANCE_MAX_Y;
}

function build(): SectorData {
  const tiles: TileData[][] = [];
  for (let y = 0; y < SECTOR_SIZE; y++) {
    tiles[y] = [];
    for (let x = 0; x < SECTOR_SIZE; x++) {
      if (isPerimeter(x, y)) {
        tiles[y][x] = { walkable: false, color: WALL, topColor: WALL_TOP, detail: 'void' };
      } else if (isDanceFloor(x, y)) {
        tiles[y][x] = {
          walkable: true,
          color: (x + y) % 2 === 0 ? NEON_A : NEON_B,
          detail: 'stone',
          accentColor: 0xffffff,
        };
      } else {
        tiles[y][x] = {
          walkable: true,
          color: (x + y) % 2 === 0 ? FLOOR_A : FLOOR_B,
          detail: 'stone',
          accentColor: 0x5a4a78,
        };
      }
    }
  }

  // East doorway from the boulevard.
  for (const y of DOOR_ROWS) {
    tiles[y][SECTOR_SIZE - 1] = {
      walkable: true,
      color: FLOOR_A,
      detail: 'stone',
      accentColor: 0x5a4a78,
    };
  }

  for (const [x, y] of SOLID_DECORATIONS) {
    tiles[y][x] = { ...tiles[y][x], walkable: false };
  }

  return { sx: 0, sy: 2, tiles, decorations: DECORATIONS };
}

export const sector: SectorData = build();
