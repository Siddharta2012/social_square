import { globalToSector, sectorKey, toLocal } from './coords';
import type { SectorData, TileData } from './types';

/** Holds the currently active sectors and answers queries in global tile coords. */
export class WorldMap {
  private _sectors = new Map<string, SectorData>();

  setSector(data: SectorData): void {
    this._sectors.set(sectorKey(data.sx, data.sy), data);
  }

  removeSector(sx: number, sy: number): void {
    this._sectors.delete(sectorKey(sx, sy));
  }

  hasSector(sx: number, sy: number): boolean {
    return this._sectors.has(sectorKey(sx, sy));
  }

  getTile(gx: number, gy: number): TileData | null {
    const sx = globalToSector(gx);
    const sy = globalToSector(gy);
    const sector = this._sectors.get(sectorKey(sx, sy));
    if (!sector) return null;
    return sector.tiles[toLocal(gy)]?.[toLocal(gx)] ?? null;
  }

  isWalkable(gx: number, gy: number): boolean {
    return this.getTile(gx, gy)?.walkable ?? false;
  }
}
