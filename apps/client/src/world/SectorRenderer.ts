import Phaser from 'phaser';
import { sectorKey } from './coords';
import { SectorDecorationPainter } from './SectorDecorationPainter';
import { SectorTilePainter } from './SectorTilePainter';
import {
  SECTOR_SIZE,
  type SectorData,
} from './types';

interface SectorLayer {
  tiles: Phaser.GameObjects.Graphics;
  decorations: Phaser.GameObjects.GameObject[];
  lights: Phaser.GameObjects.Graphics[];
}

/** Draws loaded sectors into static tile layers plus depth-sorted decoration objects. */
export class SectorRenderer {
  private _layers = new Map<string, SectorLayer>();
  private _nightFactor = 0;
  private readonly _tilePainter = new SectorTilePainter();
  private readonly _decorationPainter: SectorDecorationPainter;

  constructor(private readonly scene: Phaser.Scene) {
    this._decorationPainter = new SectorDecorationPainter(scene);
  }

  render(data: SectorData): void {
    this.remove(data.sx, data.sy);

    const tiles = this.scene.add.graphics();
    tiles.setDepth(-1);

    for (let localY = 0; localY < SECTOR_SIZE; localY++) {
      for (let localX = 0; localX < SECTOR_SIZE; localX++) {
        const tile = data.tiles[localY]?.[localX];
        if (!tile) continue;
        if (tile.visible === false) continue;
        const gx = data.sx * SECTOR_SIZE + localX;
        const gy = data.sy * SECTOR_SIZE + localY;
        this._tilePainter.drawTile(tiles, gx, gy, tile);
      }
    }

    const decorations: Phaser.GameObjects.GameObject[] = [];
    const lights: Phaser.GameObjects.Graphics[] = [];
    for (const decoration of data.decorations ?? []) {
      const gx = data.sx * SECTOR_SIZE + decoration.x;
      const gy = data.sy * SECTOR_SIZE + decoration.y;
      const object = this._decorationPainter.drawDecoration(gx, gy, decoration, lights);
      decorations.push(object);
    }

    this._layers.set(sectorKey(data.sx, data.sy), { tiles, decorations, lights });
    this._applyNightFactorTo(lights);
  }

  remove(sx: number, sy: number): void {
    const key = sectorKey(sx, sy);
    const layer = this._layers.get(key);
    if (!layer) return;
    layer.tiles.destroy();
    for (const object of layer.decorations) object.destroy();
    this._layers.delete(key);
  }

  destroyAll(): void {
    for (const key of [...this._layers.keys()]) {
      const [sx, sy] = key.split(',').map(Number);
      this.remove(sx, sy);
    }
  }

  stats(): { sectors: number; decorations: number; lights: number } {
    let decorations = 0;
    let lights = 0;
    for (const layer of this._layers.values()) {
      decorations += layer.decorations.length;
      lights += layer.lights.length;
    }
    return {
      sectors: this._layers.size,
      decorations,
      lights,
    };
  }

  setNightFactor(factor: number): void {
    this._nightFactor = Phaser.Math.Clamp(factor, 0, 1);
    for (const layer of this._layers.values()) this._applyNightFactorTo(layer.lights);
  }

  private _applyNightFactorTo(lights: Phaser.GameObjects.Graphics[]): void {
    for (const light of lights) {
      const baseAlpha = (light.getData('baseAlpha') as number | undefined) ?? 0.5;
      light.setAlpha(baseAlpha * (0.25 + this._nightFactor * 1.35));
    }
  }

}
