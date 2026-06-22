import Phaser from 'phaser';
import { IsometricSystem } from '../systems/IsometricSystem';
import type { TileData } from './types';

export class SectorTilePainter {
  drawTile(
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

    this._drawSurfaceDetail(gfx, gx, gy, tile, top, right, bottom, left);

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

    const lift = tile.detail === 'hedge' ? 12 : 8;
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

  private _drawSurfaceDetail(
    gfx: Phaser.GameObjects.Graphics,
    gx: number,
    gy: number,
    tile: TileData,
    top: Phaser.Types.Math.Vector2Like,
    right: Phaser.Types.Math.Vector2Like,
    bottom: Phaser.Types.Math.Vector2Like,
    left: Phaser.Types.Math.Vector2Like,
  ): void {
    const accent = tile.accentColor ?? this._shade(tile.color, 1.25);

    if (tile.detail === 'wood') {
      gfx.lineStyle(1, accent, 0.18);
      const t = ((gx + gy) % 4) / 4;
      const a = Phaser.Math.Linear(left.x, top.x, t);
      const b = Phaser.Math.Linear(left.y, top.y, t);
      const c = Phaser.Math.Linear(bottom.x, right.x, t);
      const d = Phaser.Math.Linear(bottom.y, right.y, t);
      gfx.lineBetween(a, b, c, d);
      gfx.lineStyle(1, 0x000000, 0.12);
      gfx.lineBetween(left.x + 7, left.y + 3, bottom.x - 7, bottom.y - 3);
    } else if (tile.detail === 'grass') {
      const seed = Math.abs((gx * 17 + gy * 31) % 5);
      gfx.lineStyle(1, accent, 0.22);
      for (let i = 0; i < seed; i++) {
        const ox = -18 + i * 9 + ((gx + gy + i) % 4);
        const oy = -2 + ((gx * 3 + gy + i) % 10);
        gfx.lineBetween(top.x + ox + 20, top.y + oy + 17, top.x + ox + 22, top.y + oy + 12);
      }
    } else if (tile.detail === 'path' || tile.detail === 'stone') {
      gfx.fillStyle(accent, 0.18);
      const seed = Math.abs((gx * 11 + gy * 23) % 4);
      for (let i = 0; i <= seed; i++) {
        gfx.fillCircle(top.x - 14 + i * 11, top.y + 18 + ((gx + i) % 8), 1.2);
      }
    } else if (tile.detail === 'water') {
      gfx.lineStyle(1.5, accent, 0.35);
      const waveOffset = ((gx * 5 + gy * 7) % 5) - 2;
      gfx.lineBetween(left.x + 12, left.y + 3 + waveOffset, top.x + 5, top.y + 16 + waveOffset);
      gfx.lineBetween(top.x + 8, top.y + 18 - waveOffset, right.x - 12, right.y + 2 - waveOffset);
    }
  }

  private _shade(color: number, factor: number): number {
    const r = Phaser.Math.Clamp(Math.floor(((color >> 16) & 0xff) * factor), 0, 255);
    const g = Phaser.Math.Clamp(Math.floor(((color >> 8) & 0xff) * factor), 0, 255);
    const b = Phaser.Math.Clamp(Math.floor((color & 0xff) * factor), 0, 255);
    return (r << 16) | (g << 8) | b;
  }
}
