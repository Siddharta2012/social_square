/** Side length (in tiles) of a square sector. */
export const SECTOR_SIZE = 24;

export interface TileData {
  walkable: boolean;
  color: number;
  /** Invisible tiles still block movement but are not rendered or highlighted. */
  visible?: boolean;
  /** Optional raised top-face color for obstacles. */
  topColor?: number;
  /** Optional surface detail rendered on the tile. */
  detail?: 'wood' | 'grass' | 'path' | 'stone' | 'hedge' | 'void';
  /** Optional detail stroke/dot color. */
  accentColor?: number;
}

export type DecorationKind =
  | 'barWall'
  | 'barCounter'
  | 'bottleShelf'
  | 'stool'
  | 'table'
  | 'jukebox'
  | 'tree'
  | 'shrub'
  | 'bench'
  | 'umbrella'
  | 'gardenTable'
  | 'stringLight'
  | 'flowerPatch'
  | 'grassTuft';

export interface DecorationData {
  kind: DecorationKind;
  /** Local sector tile coordinates. */
  x: number;
  y: number;
  variant?: number;
  color?: number;
  accentColor?: number;
}

export interface SectorData {
  sx: number;
  sy: number;
  /** SECTOR_SIZE by SECTOR_SIZE, indexed [localY][localX]. */
  tiles: TileData[][];
  decorations?: DecorationData[];
}

/** Shape of a dynamically imported sector module. */
export interface SectorModule {
  sector: SectorData;
}
