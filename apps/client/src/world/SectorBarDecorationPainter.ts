import Phaser from 'phaser';
import type { DecorationData } from './types';

export class SectorBarDecorationPainter {
  constructor(private readonly scene: Phaser.Scene) {}

  private _softShadow(gfx: Phaser.GameObjects.Graphics, width: number, height: number, y = 2): void {
    gfx.fillStyle(0x000000, 0.2);
    gfx.fillEllipse(0, y, width, height);
    gfx.fillStyle(0x000000, 0.08);
    gfx.fillEllipse(0, y, width * 1.35, height * 1.35);
  }

  drawBarWall(gfx: Phaser.GameObjects.Graphics, decoration: DecorationData): void {
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

  drawBarCounter(gfx: Phaser.GameObjects.Graphics, decoration: DecorationData): void {
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

  drawBottleShelf(
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

  drawBarSign(
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

  drawStool(gfx: Phaser.GameObjects.Graphics, decoration: DecorationData): void {
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

  drawBarTable(gfx: Phaser.GameObjects.Graphics, decoration: DecorationData): void {
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

  drawPoolTable(
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

  drawJukebox(
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

  private _shade(color: number, factor: number): number {
    const r = Phaser.Math.Clamp(Math.floor(((color >> 16) & 0xff) * factor), 0, 255);
    const g = Phaser.Math.Clamp(Math.floor(((color >> 8) & 0xff) * factor), 0, 255);
    const b = Phaser.Math.Clamp(Math.floor((color & 0xff) * factor), 0, 255);
    return (r << 16) | (g << 8) | b;
  }
}
