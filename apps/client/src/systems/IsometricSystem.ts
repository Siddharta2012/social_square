/**
 * IsometricSystem
 * 2:1 dimetric projection — tile base 64x32 px
 * worldToIso: x=(worldX-worldY)*32, y=(worldX+worldY)*16
 * Depth = worldX + worldY (dirty-flag sorted)
 */

import Phaser from 'phaser';

export interface IsoPoint {
  x: number;
  y: number;
}

export interface WorldPoint {
  x: number;
  y: number;
}

export class IsometricSystem {
  /** Half-width of a tile in screen pixels (64/2 = 32) */
  static readonly TILE_HALF_W = 32;
  /** Half-height of a tile in screen pixels (32/2 = 16) */
  static readonly TILE_HALF_H = 16;

  /**
   * Convert grid (world) coordinates to isometric screen coordinates.
   * Origin is the top-most diamond vertex of tile (0,0).
   */
  static worldToIso(worldX: number, worldY: number): IsoPoint {
    return {
      x: (worldX - worldY) * IsometricSystem.TILE_HALF_W,
      y: (worldX + worldY) * IsometricSystem.TILE_HALF_H,
    };
  }

  /**
   * Convert isometric screen coordinates back to grid (world) coordinates.
   * Returns floating-point grid coords; floor/round as needed.
   */
  static isoToWorld(isoX: number, isoY: number): WorldPoint {
    const hw = IsometricSystem.TILE_HALF_W;
    const hh = IsometricSystem.TILE_HALF_H;
    return {
      x: isoX / (2 * hw) + isoY / (2 * hh),
      y: -isoX / (2 * hw) + isoY / (2 * hh),
    };
  }

  /**
   * Depth value for a game object at grid position (worldX, worldY).
   * Higher depth = drawn on top.
   */
  static depth(worldX: number, worldY: number): number {
    return worldX + worldY;
  }

  // -----------------------------------------------------------------------
  // Dirty-flag depth sorter
  // -----------------------------------------------------------------------

  private _objects: Array<{ gameObject: Phaser.GameObjects.GameObject & { depth: number }; worldX: number; worldY: number }> = [];
  private _dirty = false;

  register(
    gameObject: Phaser.GameObjects.GameObject & { depth: number },
    worldX: number,
    worldY: number,
  ): void {
    this._objects.push({ gameObject, worldX, worldY });
    this._dirty = true;
  }

  unregister(gameObject: Phaser.GameObjects.GameObject): void {
    const idx = this._objects.findIndex((o) => o.gameObject === gameObject);
    if (idx !== -1) {
      this._objects.splice(idx, 1);
      this._dirty = true;
    }
  }

  updatePosition(
    gameObject: Phaser.GameObjects.GameObject,
    worldX: number,
    worldY: number,
  ): void {
    const entry = this._objects.find((o) => o.gameObject === gameObject);
    if (entry) {
      entry.worldX = worldX;
      entry.worldY = worldY;
      this._dirty = true;
    }
  }

  markDirty(): void {
    this._dirty = true;
  }

  /** Call once per frame; only re-sorts when dirty. */
  update(): void {
    if (!this._dirty) return;
    this._dirty = false;
    for (const entry of this._objects) {
      entry.gameObject.depth = IsometricSystem.depth(entry.worldX, entry.worldY);
    }
  }
}
