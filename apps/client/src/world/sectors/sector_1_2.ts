import { SECTOR_SIZE, type DecorationData, type SectorData, type TileData } from '../types';

// "Vialone delle Ville" — a tree-lined boulevard descending south-west from the
// piazza (1,1). It opens north (cols 10-11) toward the piazza, west (rows 11-12)
// into Villa Aurora (0,2) and east (rows 11-12) into Villa Belvedere (2,2).

const GRASS_A = 0x3f6b3a;
const GRASS_B = 0x477640;
const PAVE_A = 0x8a7a55;
const PAVE_B = 0x968755;
const HEDGE = 0x274d24;
const HEDGE_TOP = 0x376d30;

const AVENUE_MIN = 9;
const AVENUE_MAX = 14;
const DOOR_ROWS = [11, 12];

function grassTile(x: number, y: number): TileData {
  return {
    walkable: true,
    color: (x + y) % 2 === 0 ? GRASS_A : GRASS_B,
    detail: 'grass',
    accentColor: 0x6bb758,
  };
}

function paveTile(x: number, y: number): TileData {
  return {
    walkable: true,
    color: (x + y) % 2 === 0 ? PAVE_A : PAVE_B,
    detail: 'path',
    accentColor: 0xb8aa7a,
  };
}

function hedgeTile(): TileData {
  return { walkable: false, color: HEDGE, topColor: HEDGE_TOP, detail: 'hedge', accentColor: 0x5f9a48 };
}

const SOLID_DECORATIONS: Array<[number, number]> = [
  [7, 3], [16, 3], [7, 7], [16, 7], [7, 17], [16, 17], [7, 20], [16, 20],
  [8, 5], [15, 5], [8, 19], [15, 19],
  [6, 11], [17, 11],
];

const DECORATIONS: DecorationData[] = [
  // Trees lining the avenue
  ...[[7, 3], [16, 3], [7, 7], [16, 7], [7, 17], [16, 17], [7, 20], [16, 20]].map(
    ([x, y], variant) => ({ kind: 'tree' as const, x, y, variant: variant % 4 }),
  ),
  // Lamps along the avenue edges
  { kind: 'streetLamp', x: 8, y: 5, variant: 0 },
  { kind: 'streetLamp', x: 15, y: 5, variant: 1 },
  { kind: 'streetLamp', x: 8, y: 19, variant: 2 },
  { kind: 'streetLamp', x: 15, y: 19, variant: 3 },
  // Signposts toward each villa
  { kind: 'signpost', x: 6, y: 11, variant: 0, color: 0x7a3bd0 },
  { kind: 'signpost', x: 17, y: 11, variant: 1, color: 0x8a5a35 },
  // Benches and planters mid-avenue
  { kind: 'bench', x: 10, y: 8, variant: 0 },
  { kind: 'bench', x: 13, y: 16, variant: 1 },
  { kind: 'planter', x: 9, y: 22, variant: 0, accentColor: 0xf2cc5d },
  { kind: 'planter', x: 14, y: 22, variant: 1, accentColor: 0xe85d75 },
];

function build(): SectorData {
  const tiles: TileData[][] = [];
  for (let y = 0; y < SECTOR_SIZE; y++) {
    tiles[y] = [];
    for (let x = 0; x < SECTOR_SIZE; x++) {
      tiles[y][x] = grassTile(x, y);
    }
  }

  // Central avenue (full height) + side connectors to the villa doorways.
  for (let y = 0; y < SECTOR_SIZE; y++) {
    for (let x = AVENUE_MIN; x <= AVENUE_MAX; x++) tiles[y][x] = paveTile(x, y);
  }
  for (const y of DOOR_ROWS) {
    for (let x = 0; x < SECTOR_SIZE; x++) tiles[y][x] = paveTile(x, y);
  }

  // Perimeter hedges, leaving the three doorways open.
  for (let x = 0; x < SECTOR_SIZE; x++) {
    if (x < AVENUE_MIN || x > AVENUE_MAX) tiles[0][x] = hedgeTile(); // north (avenue mouth open)
    tiles[SECTOR_SIZE - 1][x] = hedgeTile();                          // south (dead end for now)
  }
  for (let y = 1; y < SECTOR_SIZE - 1; y++) {
    if (!DOOR_ROWS.includes(y)) {
      tiles[y][0] = hedgeTile();               // west wall (door to Villa Aurora)
      tiles[y][SECTOR_SIZE - 1] = hedgeTile();  // east wall (door to Villa Belvedere)
    }
  }

  for (const [x, y] of SOLID_DECORATIONS) {
    tiles[y][x] = { ...tiles[y][x], walkable: false };
  }

  return { sx: 1, sy: 2, tiles, decorations: DECORATIONS };
}

export const sector: SectorData = build();
