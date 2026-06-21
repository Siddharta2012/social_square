/**
 * TestRoomScene
 * 20x20 isometric grid with colored floor tiles and some obstacle blocks.
 * Used to verify the isometric engine, A* pathfinding, and camera system.
 */

import { BaseRoomScene, RoomConfig, TileData } from './BaseRoomScene';

// Tile color palette
const FLOOR_COLORS = [
  0x2d6a4f, // dark green
  0x40916c, // medium green
  0x52b788, // light green
  0x74c69d, // pale green
];

const OBSTACLE_COLOR = 0x8b4513; // brown

export class TestRoomScene extends BaseRoomScene {
  constructor() {
    super('TestRoomScene');
  }

  protected getRoomConfig(): RoomConfig {
    const COLS = 20;
    const ROWS = 20;

    // Build tile grid
    const tiles: TileData[][] = [];

    for (let row = 0; row < ROWS; row++) {
      tiles[row] = [];
      for (let col = 0; col < COLS; col++) {
        // Checkerboard-ish color variation
        const colorIdx = (col + row) % FLOOR_COLORS.length;
        tiles[row][col] = {
          walkable: true,
          color: FLOOR_COLORS[colorIdx],
        };
      }
    }

    // Place obstacles — a few scattered blocks and a small wall
    const obstaclePositions: Array<[number, number]> = [
      // Small cluster top-left area
      [3, 3], [4, 3], [3, 4],
      // Diagonal wall in the middle
      [8, 5], [9, 6], [10, 7], [11, 8],
      // Bottom-right cluster
      [15, 14], [16, 14], [15, 15], [16, 15],
      // Single pillars
      [5, 12], [12, 4], [17, 8], [7, 17],
    ];

    for (const [col, row] of obstaclePositions) {
      if (row >= 0 && row < ROWS && col >= 0 && col < COLS) {
        tiles[row][col] = {
          walkable: false,
          color: OBSTACLE_COLOR,
        };
      }
    }

    return {
      cols: COLS,
      rows: ROWS,
      tiles,
      spawnX: 1,
      spawnY: 1,
      username: 'Player',
    };
  }
}
