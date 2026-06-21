/** Side length (in tiles) of a square sector. */
export const SECTOR_SIZE = 24;

export interface TileData {
  walkable: boolean;
  color: number;
  /** Optional raised top-face color for obstacles. */
  topColor?: number;
}

export interface SectorData {
  sx: number;
  sy: number;
  /** SECTOR_SIZE by SECTOR_SIZE, indexed [localY][localX]. */
  tiles: TileData[][];
}

/** Shape of a dynamically imported sector module. */
export interface SectorModule {
  sector: SectorData;
}
