import Phaser from 'phaser';
import { IsometricSystem } from '../systems/IsometricSystem';
import { sectorKey } from './coords';
import { SECTOR_SIZE, type SectorData, type TileData } from './types';

/** Draws loaded sectors into one Phaser Graphics layer per sector. */
export class SectorRenderer {
  private _layers = new Map<string, Phaser.GameObjects.Graphics>();

  constructor(private readonly scene: Phaser.Scene) {}

  render(data: SectorData): void {
    this.remove(data.sx, data.sy);

    const gfx = this.scene.add.graphics();
    gfx.setDepth(-1);

    for (let localY = 0; localY < SECTOR_SIZE; localY++) {
      for (let localX = 0; localX < SECTOR_SIZE; localX++) {
        const tile = data.tiles[localY]?.[localX];
        if (!tile) continue;
        const gx = data.sx * SECTOR_SIZE + localX;
        const gy = data.sy * SECTOR_SIZE + localY;
        this._drawTile(gfx, gx, gy, tile);
      }
    }

    this._layers.set(sectorKey(data.sx, data.sy), gfx);
  }

  remove(sx: number, sy: number): void {
    const key = sectorKey(sx, sy);
    this._layers.get(key)?.destroy();
    this._layers.delete(key);
  }

  destroyAll(): void {
    for (const layer of this._layers.values()) layer.destroy();
    this._layers.clear();
  }

  private _drawTile(
    gfx: Phaser.GameObjects.Graphics,
    gx: number,
    gy: number,
    tile: TileData,
  ): void {
    const iso = IsometricSystem.worldToIso(gx, gy);
    const hw = IsometricSystem.TILE_HALF_W;
    const hh = IsometricSystem.TILE_HALF_H;

    const top = { x: iso.x, y: iso.y - hh };
    const right = { x: iso.x + hw, y: iso.y };
    const bottom = { x: iso.x, y: iso.y + hh };
    const left = { x: iso.x - hw, y: iso.y };

    gfx.fillStyle(tile.color, 1);
    gfx.fillPoints([top, right, bottom, left], true);

    if (tile.walkable) {
      gfx.lineStyle(1.5, 0xffffff, 0.13);
      gfx.lineBetween(left.x, left.y, top.x, top.y);
      gfx.lineBetween(top.x, top.y, right.x, right.y);
      gfx.lineStyle(1.5, 0x000000, 0.18);
      gfx.lineBetween(right.x, right.y, bottom.x, bottom.y);
      gfx.lineBetween(bottom.x, bottom.y, left.x, left.y);
      return;
    }

    gfx.lineStyle(1, 0x000000, 0.5);
    gfx.strokePoints([top, right, bottom, left], true);

    const lift = 8;
    const topTop = { x: iso.x, y: iso.y - hh - lift };
    const topRight = { x: iso.x + hw, y: iso.y - lift };
    const topBottom = { x: iso.x, y: iso.y + hh - lift };
    const topLeft = { x: iso.x - hw, y: iso.y - lift };

    gfx.fillStyle(tile.topColor ?? tile.color, 1);
    gfx.fillPoints([topTop, topRight, topBottom, topLeft], true);
    gfx.lineStyle(1, 0x000000, 0.4);
    gfx.strokePoints([topTop, topRight, topBottom, topLeft], true);

    gfx.fillStyle(this._shade(tile.color, 0.72), 1);
    gfx.fillPoints([topRight, right, bottom, topBottom], true);
    gfx.fillStyle(this._shade(tile.color, 0.58), 1);
    gfx.fillPoints([topLeft, left, bottom, topBottom], true);
  }

  private _shade(color: number, factor: number): number {
    const r = Math.floor(((color >> 16) & 0xff) * factor);
    const g = Math.floor(((color >> 8) & 0xff) * factor);
    const b = Math.floor((color & 0xff) * factor);
    return (r << 16) | (g << 8) | b;
  }
}
