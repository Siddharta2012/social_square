import { SECTOR_SIZE, type SectorData, type TileData } from '../types';

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

function build(): SectorData {
  const tiles: TileData[][] = [];
  for (let y = 0; y < SECTOR_SIZE; y++) {
    tiles[y] = [];
    for (let x = 0; x < SECTOR_SIZE; x++) {
      const insideBar = x < BAR_COLS && y < BAR_ROWS;
      tiles[y][x] = insideBar
        ? { walkable: true, color: (x + y) % 2 === 0 ? FLOOR_A : FLOOR_B }
        : { walkable: false, color: WALL, topColor: WALL };
    }
  }

  for (const [x, y] of OBSTACLES) {
    tiles[y][x] = { walkable: false, color: OBSTACLE, topColor: OBSTACLE };
  }

  tiles[BAR_ROWS - 1][9] = { walkable: true, color: FLOOR_A };
  tiles[BAR_ROWS - 1][10] = { walkable: true, color: FLOOR_B };
  for (let y = BAR_ROWS; y < SECTOR_SIZE; y++) {
    tiles[y][9] = { walkable: true, color: FLOOR_A };
    tiles[y][10] = { walkable: true, color: FLOOR_B };
  }

  return { sx: 0, sy: 0, tiles };
}

export const sector: SectorData = build();
