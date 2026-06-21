import { SECTOR_SIZE, type DecorationData, type SectorData, type TileData } from '../types';

const FLOOR_A = 0x3d2b1f;
const FLOOR_B = 0x4a3525;
const OBSTACLE = 0x6b3a2a;
const WALL = 0x2a1d17;

const BAR_COLS = 18;
const BAR_ROWS = 17;

const OBSTACLES: Array<[number, number]> = [
  [1, 0], [2, 0], [3, 0], [4, 0], [5, 0], [6, 0], [7, 0], [8, 0],
  [15, 0], [16, 0], [17, 0],
  [16, 3],
  [4, 5], [5, 5],
  [12, 5], [13, 5],
  [4, 10], [5, 10],
  [12, 10], [13, 10],
];

const DECORATIONS: DecorationData[] = [
  ...Array.from({ length: BAR_COLS }, (_, x) => ({ kind: 'barWall' as const, x, y: 0 })),
  ...Array.from({ length: 8 }, (_, i) => ({ kind: 'barCounter' as const, x: i + 1, y: 0 })),
  { kind: 'bottleShelf', x: 15, y: 0, variant: 0 },
  { kind: 'bottleShelf', x: 16, y: 0, variant: 2 },
  { kind: 'bottleShelf', x: 17, y: 0, variant: 4 },
  { kind: 'jukebox', x: 16, y: 3 },
  { kind: 'table', x: 4, y: 5, variant: 0 },
  { kind: 'table', x: 12, y: 5, variant: 1 },
  { kind: 'table', x: 4, y: 10, variant: 2 },
  { kind: 'table', x: 12, y: 10, variant: 3 },
  ...[1, 3, 5, 7].map((x, variant) => ({ kind: 'stool' as const, x, y: 1, variant })),
  ...[
    [3, 6], [6, 6], [11, 6], [14, 6],
    [3, 11], [6, 11], [11, 11], [14, 11],
  ].map(([x, y], variant) => ({ kind: 'stool' as const, x, y, variant })),
];

function build(): SectorData {
  const tiles: TileData[][] = [];
  for (let y = 0; y < SECTOR_SIZE; y++) {
    tiles[y] = [];
    for (let x = 0; x < SECTOR_SIZE; x++) {
      const insideBar = x < BAR_COLS && y < BAR_ROWS;
      tiles[y][x] = insideBar
        ? {
            walkable: true,
            color: (x + y) % 2 === 0 ? FLOOR_A : FLOOR_B,
            detail: 'wood',
            accentColor: 0x6b4a32,
          }
        : { walkable: false, visible: false, color: WALL, topColor: WALL, detail: 'void' };
    }
  }

  for (const [x, y] of OBSTACLES) {
    tiles[y][x] = { walkable: false, color: OBSTACLE, topColor: OBSTACLE, detail: 'wood' };
  }

  tiles[BAR_ROWS - 1][9] = { walkable: true, color: FLOOR_A, detail: 'wood', accentColor: 0x6b4a32 };
  tiles[BAR_ROWS - 1][10] = { walkable: true, color: FLOOR_B, detail: 'wood', accentColor: 0x6b4a32 };
  for (let y = BAR_ROWS; y < SECTOR_SIZE; y++) {
    tiles[y][9] = { walkable: true, color: FLOOR_A, detail: 'wood', accentColor: 0x6b4a32 };
    tiles[y][10] = { walkable: true, color: FLOOR_B, detail: 'wood', accentColor: 0x6b4a32 };
  }

  return { sx: 0, sy: 0, tiles, decorations: DECORATIONS };
}

export const sector: SectorData = build();
