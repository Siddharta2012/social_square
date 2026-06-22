import Phaser from 'phaser';
import { IsometricSystem } from '../systems/IsometricSystem';
import { sectorKey } from './coords';
import {
  SECTOR_SIZE,
  type DecorationData,
  type SectorData,
  type TileData,
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

  constructor(private readonly scene: Phaser.Scene) {}

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
        this._drawTile(tiles, gx, gy, tile);
      }
    }

    const decorations: Phaser.GameObjects.GameObject[] = [];
    const lights: Phaser.GameObjects.Graphics[] = [];
    for (const decoration of data.decorations ?? []) {
      const gx = data.sx * SECTOR_SIZE + decoration.x;
      const gy = data.sy * SECTOR_SIZE + decoration.y;
      const object = this._drawDecoration(gx, gy, decoration, lights);
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

  private _drawDecoration(
    gx: number,
    gy: number,
    decoration: DecorationData,
    lights: Phaser.GameObjects.Graphics[],
  ): Phaser.GameObjects.Container {
    const iso = IsometricSystem.worldToIso(gx, gy);
    const container = this.scene.add.container(iso.x, iso.y);
    const light = this.scene.add.graphics();
    container.add(light);
    const gfx = this.scene.add.graphics();
    container.add(gfx);

    switch (decoration.kind) {
      case 'barWall':
        this._drawBarWall(gfx, decoration);
        container.setDepth(IsometricSystem.depth(gx, gy) - 0.65);
        break;
      case 'barCounter':
        this._drawBarCounter(gfx, decoration);
        container.setDepth(IsometricSystem.depth(gx, gy) - 0.08);
        break;
      case 'bottleShelf':
        this._drawBottleShelf(gfx, light, decoration);
        lights.push(this._registerLight(light, 0.45));
        container.setDepth(IsometricSystem.depth(gx, gy) - 0.25);
        break;
      case 'barSign':
        this._drawBarSign(container, gfx, light, decoration);
        lights.push(this._registerLight(light, 0.62));
        container.setDepth(IsometricSystem.depth(gx, gy) + 0.22);
        break;
      case 'stool':
        this._drawStool(gfx, decoration);
        container.setDepth(IsometricSystem.depth(gx, gy) + 0.08);
        break;
      case 'table':
        this._drawBarTable(gfx, decoration);
        container.setDepth(IsometricSystem.depth(gx, gy) + 0.08);
        break;
      case 'poolTable':
        this._drawPoolTable(gfx, light, decoration);
        lights.push(this._registerLight(light, 0.32));
        container.setDepth(IsometricSystem.depth(gx, gy) + 0.11);
        break;
      case 'jukebox':
        this._drawJukebox(gfx, light, decoration);
        lights.push(this._registerLight(light, 0.7));
        container.setDepth(IsometricSystem.depth(gx, gy) + 0.1);
        break;
      case 'tree':
        this._drawTree(gfx, light, decoration);
        lights.push(this._registerLight(light, 0.22));
        container.setDepth(IsometricSystem.depth(gx, gy) + 0.28);
        break;
      case 'shrub':
        this._drawShrub(gfx, decoration);
        container.setDepth(IsometricSystem.depth(gx, gy) + 0.08);
        break;
      case 'bench':
        this._drawBench(gfx, decoration);
        container.setDepth(IsometricSystem.depth(gx, gy) + 0.08);
        break;
      case 'umbrella':
        this._drawUmbrella(gfx, decoration);
        container.setDepth(IsometricSystem.depth(gx, gy) + 0.2);
        break;
      case 'gardenTable':
        this._drawGardenTable(gfx, decoration);
        container.setDepth(IsometricSystem.depth(gx, gy) + 0.08);
        break;
      case 'stringLight':
        this._drawStringLight(gfx, light, decoration);
        lights.push(this._registerLight(light, 0.55));
        container.setDepth(IsometricSystem.depth(gx, gy) + 0.16);
        break;
      case 'flowerPatch':
        this._drawFlowerPatch(gfx, decoration);
        container.setDepth(IsometricSystem.depth(gx, gy) + 0.03);
        break;
      case 'grassTuft':
        this._drawGrassTuft(gfx, decoration);
        container.setDepth(IsometricSystem.depth(gx, gy) + 0.02);
        break;
      case 'streetLamp':
        this._drawStreetLamp(gfx, light, decoration);
        lights.push(this._registerLight(light, 0.72));
        container.setDepth(IsometricSystem.depth(gx, gy) + 0.18);
        break;
      case 'fountain':
        this._drawFountain(gfx, light, decoration);
        lights.push(this._registerLight(light, 0.2));
        container.setDepth(IsometricSystem.depth(gx, gy) + 0.16);
        break;
      case 'marketStall':
        this._drawMarketStall(gfx, decoration);
        container.setDepth(IsometricSystem.depth(gx, gy) + 0.15);
        break;
      case 'shopFront':
        this._drawShopFront(gfx, decoration);
        container.setDepth(IsometricSystem.depth(gx, gy) - 0.22);
        break;
      case 'signpost':
        this._drawSignpost(gfx, decoration);
        container.setDepth(IsometricSystem.depth(gx, gy) + 0.12);
        break;
      case 'planter':
        this._drawPlanter(gfx, decoration);
        container.setDepth(IsometricSystem.depth(gx, gy) + 0.08);
        break;
      case 'well':
        this._drawWell(gfx, decoration);
        container.setDepth(IsometricSystem.depth(gx, gy) + 0.12);
        break;
    }

    return container;
  }

  private _registerLight(gfx: Phaser.GameObjects.Graphics, baseAlpha: number): Phaser.GameObjects.Graphics {
    gfx.setData('baseAlpha', baseAlpha);
    return gfx;
  }

  private _softShadow(gfx: Phaser.GameObjects.Graphics, width: number, height: number, y = 2): void {
    gfx.fillStyle(0x000000, 0.2);
    gfx.fillEllipse(0, y, width, height);
    gfx.fillStyle(0x000000, 0.08);
    gfx.fillEllipse(0, y, width * 1.35, height * 1.35);
  }

  private _drawBarWall(gfx: Phaser.GameObjects.Graphics, decoration: DecorationData): void {
    const color = decoration.color ?? 0x2d1f1a;
    const trim = decoration.accentColor ?? 0x5e3a2d;
    gfx.fillStyle(this._shade(color, 0.72), 1);
    gfx.fillRect(-34, -64, 68, 54);
    gfx.fillStyle(color, 1);
    gfx.fillRect(-31, -66, 62, 50);
    gfx.fillStyle(trim, 1);
    gfx.fillRect(-32, -20, 64, 6);
    gfx.lineStyle(1, 0xffffff, 0.1);
    gfx.lineBetween(-30, -64, 30, -64);
    gfx.lineStyle(1, 0x000000, 0.35);
    gfx.strokeRect(-31, -66, 62, 50);
  }

  private _drawBarCounter(gfx: Phaser.GameObjects.Graphics, decoration: DecorationData): void {
    const wood = decoration.color ?? 0x7a4229;
    this._softShadow(gfx, 62, 18, 5);
    gfx.fillStyle(this._shade(wood, 0.65), 1);
    gfx.fillRoundedRect(-30, -22, 60, 24, 3);
    gfx.fillStyle(wood, 1);
    gfx.fillRoundedRect(-32, -32, 64, 17, 4);
    gfx.fillStyle(0xb87746, 1);
    gfx.fillRect(-27, -29, 54, 4);
    gfx.lineStyle(1, 0x000000, 0.35);
    gfx.strokeRoundedRect(-32, -32, 64, 34, 4);
  }

  private _drawBottleShelf(
    gfx: Phaser.GameObjects.Graphics,
    light: Phaser.GameObjects.Graphics,
    decoration: DecorationData,
  ): void {
    const wood = decoration.color ?? 0x5b3525;
    gfx.fillStyle(wood, 1);
    gfx.fillRoundedRect(-28, -50, 56, 35, 3);
    gfx.fillStyle(0x2a1710, 1);
    gfx.fillRect(-24, -44, 48, 9);
    gfx.fillRect(-24, -29, 48, 8);
    const bottleColors = [0x44aa66, 0x7a5cff, 0xffd166, 0xdd3f5a, 0x77d0ff];
    for (let i = 0; i < 7; i++) {
      const x = -21 + i * 7;
      gfx.fillStyle(bottleColors[(i + (decoration.variant ?? 0)) % bottleColors.length], 1);
      gfx.fillRoundedRect(x, -47 + (i % 2) * 2, 4, 12, 1);
      gfx.fillStyle(0xffffff, 0.25);
      gfx.fillRect(x + 1, -45 + (i % 2) * 2, 1, 7);
    }
    light.fillStyle(0xffd67a, 1);
    light.fillCircle(0, -31, 30);
  }

  private _drawBarSign(
    container: Phaser.GameObjects.Container,
    gfx: Phaser.GameObjects.Graphics,
    light: Phaser.GameObjects.Graphics,
    decoration: DecorationData,
  ): void {
    this._softShadow(gfx, 48, 14, 5);
    gfx.lineStyle(5, 0x3d2417, 1);
    gfx.lineBetween(-18, -2, -18, -74);
    gfx.lineBetween(18, -2, 18, -74);
    gfx.lineStyle(2, 0x8a5a35, 1);
    gfx.lineBetween(-18, -8, -18, -70);
    gfx.lineBetween(18, -8, 18, -70);

    const outer = decoration.color ?? 0x8f2333;
    const inner = decoration.accentColor ?? 0xffd166;
    gfx.fillStyle(0x2b1518, 1);
    gfx.fillRoundedRect(-42, -94, 84, 50, 7);
    gfx.fillStyle(outer, 1);
    gfx.fillRoundedRect(-38, -90, 76, 42, 6);
    gfx.fillStyle(inner, 1);
    gfx.fillRoundedRect(-32, -84, 64, 30, 4);
    gfx.fillStyle(0x2b1518, 1);
    gfx.fillRoundedRect(-28, -80, 56, 22, 3);
    gfx.lineStyle(2, 0xfff4d0, 0.55);
    gfx.strokeRoundedRect(-38, -90, 76, 42, 6);

    light.fillStyle(0xffd166, 1);
    light.fillCircle(0, -70, 44);

    const label = this.scene.add.text(0, -69, 'BAR BORA\nH24', {
      fontSize: '12px',
      color: '#fff4d0',
      fontFamily: 'monospace',
      fontStyle: 'bold',
      align: 'center',
      stroke: '#401016',
      strokeThickness: 3,
      lineSpacing: -2,
    }).setOrigin(0.5);
    container.add(label);
  }

  private _drawStool(gfx: Phaser.GameObjects.Graphics, decoration: DecorationData): void {
    const seat = decoration.color ?? 0x8d4b32;
    this._softShadow(gfx, 26, 8, 1);
    gfx.lineStyle(2, 0x2b1b16, 1);
    gfx.lineBetween(-8, -3, -13, 9);
    gfx.lineBetween(8, -3, 13, 9);
    gfx.lineBetween(0, -3, 0, 10);
    gfx.fillStyle(seat, 1);
    gfx.fillEllipse(0, -7, 24, 12);
    gfx.fillStyle(0xffffff, 0.18);
    gfx.fillEllipse(-4, -9, 11, 4);
  }

  private _drawBarTable(gfx: Phaser.GameObjects.Graphics, decoration: DecorationData): void {
    const wood = decoration.color ?? 0x6a3a26;
    this._softShadow(gfx, 56, 18, 3);
    gfx.fillStyle(this._shade(wood, 0.62), 1);
    gfx.fillRoundedRect(-20, -12, 40, 20, 4);
    gfx.fillStyle(wood, 1);
    gfx.fillEllipse(0, -15, 48, 24);
    gfx.fillStyle(0xf5d58a, 0.9);
    gfx.fillCircle(-8, -17, 3);
    gfx.fillStyle(0x3b2b22, 0.65);
    gfx.fillCircle(8, -15, 3);
  }

  private _drawPoolTable(
    gfx: Phaser.GameObjects.Graphics,
    light: Phaser.GameObjects.Graphics,
    decoration: DecorationData,
  ): void {
    const rail = decoration.color ?? 0x5f3a24;
    const felt = decoration.accentColor ?? 0x177a53;
    this._softShadow(gfx, 108, 30, 5);
    gfx.fillStyle(this._shade(rail, 0.6), 1);
    gfx.fillRoundedRect(-54, -27, 108, 38, 7);
    gfx.fillStyle(rail, 1);
    gfx.fillRoundedRect(-50, -34, 100, 42, 7);
    gfx.fillStyle(felt, 1);
    gfx.fillRoundedRect(-41, -28, 82, 30, 5);
    gfx.fillStyle(0x0b231a, 1);
    for (const [x, y] of [[-38, -25], [0, -27], [38, -25], [-38, -1], [0, 1], [38, -1]] as Array<[number, number]>) {
      gfx.fillCircle(x, y, 4);
    }
    gfx.lineStyle(2, 0xd7b56d, 0.9);
    gfx.lineBetween(-33, -12, 26, -21);
    gfx.fillStyle(0xffffff, 1);
    gfx.fillCircle(-18, -15, 3);
    gfx.fillStyle(0xffd166, 1);
    gfx.fillCircle(14, -14, 3);
    gfx.fillStyle(0xff6b6b, 1);
    gfx.fillCircle(22, -9, 3);
    light.fillStyle(0x78ffc9, 1);
    light.fillEllipse(0, -14, 96, 44);
  }

  private _drawJukebox(
    gfx: Phaser.GameObjects.Graphics,
    light: Phaser.GameObjects.Graphics,
    decoration: DecorationData,
  ): void {
    this._softShadow(gfx, 34, 12, 3);
    gfx.fillStyle(0x3b223e, 1);
    gfx.fillRoundedRect(-16, -45, 32, 42, 11);
    gfx.fillStyle(0xe04f77, 1);
    gfx.fillRoundedRect(-11, -41, 22, 34, 8);
    gfx.fillStyle(0xffd166, 1);
    gfx.fillEllipse(0, -30, 16, 16);
    gfx.fillStyle(0x26304d, 1);
    gfx.fillRect(-9, -19, 18, 8);
    gfx.lineStyle(2, 0x74d7ff, 1);
    gfx.strokeRoundedRect(-13, -43, 26, 38, 9);
    light.fillStyle(decoration.accentColor ?? 0xff5d9d, 1);
    light.fillCircle(0, -27, 32);
  }

  private _drawTree(
    gfx: Phaser.GameObjects.Graphics,
    light: Phaser.GameObjects.Graphics,
    decoration: DecorationData,
  ): void {
    this._softShadow(gfx, 55, 18, 6);
    gfx.fillStyle(0x76543a, 1);
    gfx.fillRoundedRect(-6, -45, 12, 45, 4);
    const leaf = decoration.color ?? 0x2f7d3c;
    const leaf2 = decoration.accentColor ?? 0x4a9a48;
    gfx.fillStyle(this._shade(leaf, 0.78), 1);
    gfx.fillCircle(-14, -54, 20);
    gfx.fillStyle(leaf, 1);
    gfx.fillCircle(8, -64, 24);
    gfx.fillStyle(leaf2, 1);
    gfx.fillCircle(20, -48, 18);
    gfx.fillCircle(-3, -78, 17);
    gfx.fillStyle(0xffffff, 0.1);
    gfx.fillCircle(2, -70, 15);
    light.fillStyle(0xffe5a3, 1);
    light.fillCircle(12, -46, 19);
  }

  private _drawShrub(gfx: Phaser.GameObjects.Graphics, decoration: DecorationData): void {
    this._softShadow(gfx, 38, 10, 3);
    const base = decoration.color ?? 0x2d6b32;
    gfx.fillStyle(this._shade(base, 0.78), 1);
    gfx.fillCircle(-11, -12, 12);
    gfx.fillStyle(base, 1);
    gfx.fillCircle(0, -17, 14);
    gfx.fillStyle(decoration.accentColor ?? 0x4f9a3f, 1);
    gfx.fillCircle(12, -12, 11);
  }

  private _drawBench(gfx: Phaser.GameObjects.Graphics, decoration: DecorationData): void {
    this._softShadow(gfx, 50, 12, 3);
    const wood = decoration.color ?? 0x8a5a35;
    gfx.fillStyle(wood, 1);
    gfx.fillRoundedRect(-24, -24, 48, 7, 2);
    gfx.fillRoundedRect(-24, -13, 48, 7, 2);
    gfx.lineStyle(2, 0x3a2920, 1);
    gfx.lineBetween(-17, -6, -20, 7);
    gfx.lineBetween(17, -6, 20, 7);
  }

  private _drawUmbrella(gfx: Phaser.GameObjects.Graphics, decoration: DecorationData): void {
    this._softShadow(gfx, 46, 14, 4);
    gfx.lineStyle(3, 0x7d6548, 1);
    gfx.lineBetween(0, -8, 0, -58);
    const canopy = decoration.color ?? 0xd94f5c;
    gfx.fillStyle(canopy, 1);
    gfx.slice(0, -58, 35, Phaser.Math.DegToRad(200), Phaser.Math.DegToRad(340), false);
    gfx.fillPath();
    gfx.fillStyle(this._shade(canopy, 0.82), 1);
    gfx.fillTriangle(-35, -58, 0, -77, 35, -58);
    gfx.lineStyle(1, 0xffffff, 0.22);
    gfx.lineBetween(0, -76, 0, -58);
    gfx.lineBetween(0, -76, -22, -58);
    gfx.lineBetween(0, -76, 22, -58);
  }

  private _drawGardenTable(gfx: Phaser.GameObjects.Graphics, decoration: DecorationData): void {
    const top = decoration.color ?? 0xd8c08a;
    this._softShadow(gfx, 42, 14, 4);
    gfx.fillStyle(this._shade(top, 0.65), 1);
    gfx.fillRoundedRect(-7, -12, 14, 18, 3);
    gfx.fillStyle(top, 1);
    gfx.fillEllipse(0, -18, 34, 18);
    gfx.fillStyle(0xf6f1d5, 0.85);
    gfx.fillCircle(-5, -20, 2.5);
    gfx.fillStyle(0x6a8dc9, 1);
    gfx.fillCircle(7, -18, 3);
  }

  private _drawStringLight(
    gfx: Phaser.GameObjects.Graphics,
    light: Phaser.GameObjects.Graphics,
    decoration: DecorationData,
  ): void {
    gfx.lineStyle(3, 0x4b3525, 1);
    gfx.lineBetween(-15, 0, -15, -56);
    gfx.lineBetween(15, 0, 15, -56);
    gfx.lineStyle(2, 0x2a2017, 1);
    gfx.lineBetween(-16, -55, -8, -49);
    gfx.lineBetween(-8, -49, 0, -46);
    gfx.lineBetween(0, -46, 8, -49);
    gfx.lineBetween(8, -49, 16, -55);
    for (const x of [-12, 0, 12]) {
      gfx.fillStyle(0xffd36d, 1);
      gfx.fillCircle(x, x === 0 ? -45 : -52, 3);
      light.fillStyle(0xffd36d, 1);
      light.fillCircle(x, x === 0 ? -45 : -52, 14);
    }
  }

  private _drawFlowerPatch(gfx: Phaser.GameObjects.Graphics, decoration: DecorationData): void {
    const colors = [0xf2cc5d, 0xe85d75, 0x9b7cff, 0xffffff];
    for (let i = 0; i < 8; i++) {
      const x = -16 + (i % 4) * 10 + ((decoration.variant ?? 0) % 3);
      const y = -5 + Math.floor(i / 4) * 8;
      gfx.lineStyle(1, 0x2e7d36, 0.8);
      gfx.lineBetween(x, y, x, y - 6);
      gfx.fillStyle(colors[(i + (decoration.variant ?? 0)) % colors.length], 1);
      gfx.fillCircle(x, y - 7, 2.5);
    }
  }

  private _drawGrassTuft(gfx: Phaser.GameObjects.Graphics, decoration: DecorationData): void {
    const color = decoration.color ?? 0x6fbf56;
    gfx.lineStyle(2, color, 0.85);
    for (let i = 0; i < 5; i++) {
      const x = -10 + i * 5;
      const h = 7 + ((i + (decoration.variant ?? 0)) % 4);
      gfx.lineBetween(x, 0, x + 2, -h);
    }
  }

  private _drawStreetLamp(
    gfx: Phaser.GameObjects.Graphics,
    light: Phaser.GameObjects.Graphics,
    decoration: DecorationData,
  ): void {
    this._softShadow(gfx, 25, 8, 4);
    gfx.lineStyle(4, 0x2d2d35, 1);
    gfx.lineBetween(0, -2, 0, -58);
    gfx.lineStyle(2, 0x4a4a55, 1);
    gfx.lineBetween(0, -55, 13, -62);
    gfx.fillStyle(0xffd36d, 1);
    gfx.fillCircle(17, -64, 6);
    gfx.fillStyle(0xffffff, 0.45);
    gfx.fillCircle(15, -66, 2);
    light.fillStyle(decoration.accentColor ?? 0xffd36d, 1);
    light.fillCircle(17, -64, 36);
  }

  private _drawFountain(
    gfx: Phaser.GameObjects.Graphics,
    light: Phaser.GameObjects.Graphics,
    decoration: DecorationData,
  ): void {
    const stone = decoration.color ?? 0x8794a0;
    this._softShadow(gfx, 70, 22, 8);
    gfx.fillStyle(this._shade(stone, 0.64), 1);
    gfx.fillEllipse(0, -8, 66, 27);
    gfx.fillStyle(stone, 1);
    gfx.fillEllipse(0, -15, 58, 22);
    gfx.fillStyle(0x5ec7dd, 0.88);
    gfx.fillEllipse(0, -17, 45, 14);
    gfx.fillStyle(this._shade(stone, 1.1), 1);
    gfx.fillRoundedRect(-7, -42, 14, 28, 5);
    gfx.fillStyle(0x9ee8ff, 0.95);
    gfx.fillCircle(0, -48, 5);
    gfx.lineStyle(2, 0x9ee8ff, 0.8);
    gfx.lineBetween(0, -47, -12, -25);
    gfx.lineBetween(0, -47, 12, -25);
    light.fillStyle(0x7fdfff, 1);
    light.fillCircle(0, -31, 24);
  }

  private _drawMarketStall(gfx: Phaser.GameObjects.Graphics, decoration: DecorationData): void {
    const cloth = decoration.color ?? 0xd94f5c;
    this._softShadow(gfx, 62, 18, 5);
    gfx.fillStyle(0x6b4427, 1);
    gfx.fillRoundedRect(-26, -20, 52, 18, 3);
    gfx.fillStyle(this._shade(cloth, 0.78), 1);
    gfx.fillRect(-29, -45, 58, 16);
    gfx.fillStyle(cloth, 1);
    for (let i = 0; i < 4; i++) {
      const x = -29 + i * 15;
      gfx.fillRect(x, -45, 10, 16);
    }
    gfx.lineStyle(3, 0x4c3325, 1);
    gfx.lineBetween(-23, -29, -23, 1);
    gfx.lineBetween(23, -29, 23, 1);
    gfx.fillStyle(0xf2cc5d, 1);
    gfx.fillCircle(-10, -22, 4);
    gfx.fillStyle(0x6fbf56, 1);
    gfx.fillCircle(5, -22, 4);
    gfx.fillStyle(0xe85d75, 1);
    gfx.fillCircle(15, -20, 3);
  }

  private _drawShopFront(gfx: Phaser.GameObjects.Graphics, decoration: DecorationData): void {
    const wall = decoration.color ?? 0x7c6752;
    const awning = decoration.accentColor ?? 0x4d9de0;
    gfx.fillStyle(this._shade(wall, 0.62), 1);
    gfx.fillRect(-34, -78, 68, 65);
    gfx.fillStyle(wall, 1);
    gfx.fillRect(-31, -82, 62, 63);
    gfx.fillStyle(0x2d2430, 1);
    gfx.fillRect(-10, -47, 20, 28);
    gfx.fillStyle(0x9ad7ff, 0.72);
    gfx.fillRect(-26, -68, 15, 15);
    gfx.fillRect(12, -68, 15, 15);
    gfx.fillStyle(awning, 1);
    gfx.fillRect(-34, -82, 68, 10);
    for (let i = 0; i < 5; i++) {
      gfx.fillStyle(i % 2 === 0 ? awning : 0xfff4d0, 1);
      gfx.fillRect(-34 + i * 14, -72, 14, 9);
    }
    gfx.lineStyle(1, 0x000000, 0.35);
    gfx.strokeRect(-31, -82, 62, 63);
  }

  private _drawSignpost(gfx: Phaser.GameObjects.Graphics, decoration: DecorationData): void {
    gfx.lineStyle(4, 0x5b3a22, 1);
    gfx.lineBetween(0, 0, 0, -42);
    gfx.fillStyle(decoration.color ?? 0x8a5a35, 1);
    gfx.fillRoundedRect(-24, -45, 48, 15, 3);
    gfx.lineStyle(1, 0x2d1c12, 0.7);
    gfx.strokeRoundedRect(-24, -45, 48, 15, 3);
    gfx.fillStyle(0xfff4d0, 0.85);
    gfx.fillRect(-15, -39, 30, 2);
  }

  private _drawPlanter(gfx: Phaser.GameObjects.Graphics, decoration: DecorationData): void {
    this._softShadow(gfx, 38, 11, 5);
    gfx.fillStyle(decoration.color ?? 0x8a4b2a, 1);
    gfx.fillRoundedRect(-19, -14, 38, 14, 4);
    gfx.fillStyle(0x3b2318, 0.75);
    gfx.fillEllipse(0, -15, 32, 9);
    const flower = decoration.accentColor ?? 0xf2cc5d;
    for (const x of [-10, 0, 10]) {
      gfx.lineStyle(2, 0x3f7f3a, 1);
      gfx.lineBetween(x, -15, x, -28);
      gfx.fillStyle(flower, 1);
      gfx.fillCircle(x, -30, 3);
    }
  }

  private _drawWell(gfx: Phaser.GameObjects.Graphics, decoration: DecorationData): void {
    const stone = decoration.color ?? 0x7f8a91;
    const roof = decoration.accentColor ?? 0x8a4b2a;
    this._softShadow(gfx, 50, 14, 6);
    gfx.fillStyle(this._shade(stone, 0.62), 1);
    gfx.fillEllipse(0, -7, 44, 19);
    gfx.fillStyle(stone, 1);
    gfx.fillEllipse(0, -14, 40, 16);
    gfx.fillStyle(0x22313b, 0.9);
    gfx.fillEllipse(0, -16, 28, 9);
    gfx.lineStyle(3, 0x5b3a22, 1);
    gfx.lineBetween(-16, -16, -16, -48);
    gfx.lineBetween(16, -16, 16, -48);
    gfx.fillStyle(this._shade(roof, 0.72), 1);
    gfx.fillTriangle(-28, -48, 0, -68, 28, -48);
    gfx.fillStyle(roof, 1);
    gfx.fillTriangle(-22, -50, 0, -63, 22, -50);
    gfx.lineStyle(2, 0x2a1a12, 1);
    gfx.lineBetween(-10, -38, 10, -38);
    gfx.fillStyle(decoration.variant === 1 ? 0xd8c08a : 0xb88a55, 1);
    gfx.fillRoundedRect(-5, -38, 10, 9, 2);
  }

  private _shade(color: number, factor: number): number {
    const r = Phaser.Math.Clamp(Math.floor(((color >> 16) & 0xff) * factor), 0, 255);
    const g = Phaser.Math.Clamp(Math.floor(((color >> 8) & 0xff) * factor), 0, 255);
    const b = Phaser.Math.Clamp(Math.floor((color & 0xff) * factor), 0, 255);
    return (r << 16) | (g << 8) | b;
  }
}
