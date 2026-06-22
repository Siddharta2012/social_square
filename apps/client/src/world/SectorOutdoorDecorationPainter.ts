import Phaser from 'phaser';
import type { DecorationData } from './types';

export class SectorOutdoorDecorationPainter {
  private _softShadow(gfx: Phaser.GameObjects.Graphics, width: number, height: number, y = 2): void {
    gfx.fillStyle(0x000000, 0.2);
    gfx.fillEllipse(0, y, width, height);
    gfx.fillStyle(0x000000, 0.08);
    gfx.fillEllipse(0, y, width * 1.35, height * 1.35);
  }

  drawTree(
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

  drawShrub(gfx: Phaser.GameObjects.Graphics, decoration: DecorationData): void {
    this._softShadow(gfx, 38, 10, 3);
    const base = decoration.color ?? 0x2d6b32;
    gfx.fillStyle(this._shade(base, 0.78), 1);
    gfx.fillCircle(-11, -12, 12);
    gfx.fillStyle(base, 1);
    gfx.fillCircle(0, -17, 14);
    gfx.fillStyle(decoration.accentColor ?? 0x4f9a3f, 1);
    gfx.fillCircle(12, -12, 11);
  }

  drawBench(gfx: Phaser.GameObjects.Graphics, decoration: DecorationData): void {
    this._softShadow(gfx, 50, 12, 3);
    const wood = decoration.color ?? 0x8a5a35;
    gfx.fillStyle(wood, 1);
    gfx.fillRoundedRect(-24, -24, 48, 7, 2);
    gfx.fillRoundedRect(-24, -13, 48, 7, 2);
    gfx.lineStyle(2, 0x3a2920, 1);
    gfx.lineBetween(-17, -6, -20, 7);
    gfx.lineBetween(17, -6, 20, 7);
  }

  drawUmbrella(gfx: Phaser.GameObjects.Graphics, decoration: DecorationData): void {
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

  drawGardenTable(gfx: Phaser.GameObjects.Graphics, decoration: DecorationData): void {
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

  drawStringLight(
    gfx: Phaser.GameObjects.Graphics,
    light: Phaser.GameObjects.Graphics,
    _decoration: DecorationData,
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

  drawFlowerPatch(gfx: Phaser.GameObjects.Graphics, decoration: DecorationData): void {
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

  drawGrassTuft(gfx: Phaser.GameObjects.Graphics, decoration: DecorationData): void {
    const color = decoration.color ?? 0x6fbf56;
    gfx.lineStyle(2, color, 0.85);
    for (let i = 0; i < 5; i++) {
      const x = -10 + i * 5;
      const h = 7 + ((i + (decoration.variant ?? 0)) % 4);
      gfx.lineBetween(x, 0, x + 2, -h);
    }
  }

  drawStreetLamp(
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

  drawFountain(
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

  drawMarketStall(gfx: Phaser.GameObjects.Graphics, decoration: DecorationData): void {
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

  drawShopFront(gfx: Phaser.GameObjects.Graphics, decoration: DecorationData): void {
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

  drawSignpost(gfx: Phaser.GameObjects.Graphics, decoration: DecorationData): void {
    gfx.lineStyle(4, 0x5b3a22, 1);
    gfx.lineBetween(0, 0, 0, -42);
    gfx.fillStyle(decoration.color ?? 0x8a5a35, 1);
    gfx.fillRoundedRect(-24, -45, 48, 15, 3);
    gfx.lineStyle(1, 0x2d1c12, 0.7);
    gfx.strokeRoundedRect(-24, -45, 48, 15, 3);
    gfx.fillStyle(0xfff4d0, 0.85);
    gfx.fillRect(-15, -39, 30, 2);
  }

  drawPlanter(gfx: Phaser.GameObjects.Graphics, decoration: DecorationData): void {
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

  drawWell(gfx: Phaser.GameObjects.Graphics, decoration: DecorationData): void {
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
