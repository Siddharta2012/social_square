/**
 * InteractStation — a clickable object placed on an isometric tile.
 * Shows a pulsing glow + floating label on hover, and fires onInteract on
 * left-click. The owning scene must skip click-to-move when a station is
 * under the pointer (stations are flagged with data 'interactable').
 */

import Phaser from 'phaser';
import { IsometricSystem } from '../systems/IsometricSystem';

export interface InteractStationOptions {
  scene: Phaser.Scene;
  worldX: number;
  worldY: number;
  label: string;
  /** Draws the station icon centered at local (0,0). */
  draw: (g: Phaser.GameObjects.Graphics) => void;
  hitWidth?: number;
  hitHeight?: number;
  onInteract: () => void;
}

export class InteractStation extends Phaser.GameObjects.Container {
  private _glow: Phaser.GameObjects.Graphics;
  private _label: Phaser.GameObjects.Container;
  private _glowTween: Phaser.Tweens.Tween | null = null;

  constructor(opts: InteractStationOptions) {
    const iso = IsometricSystem.worldToIso(opts.worldX, opts.worldY);
    super(opts.scene, iso.x, iso.y);

    const w = opts.hitWidth ?? 30;
    const h = opts.hitHeight ?? 40;

    // Glow (hidden until hover) — drawn behind the icon
    this._glow = opts.scene.add.graphics();
    this._glow.fillStyle(0xffe14d, 0.18);
    this._glow.fillEllipse(0, -10, w + 14, h + 8);
    this._glow.lineStyle(2, 0xffe14d, 0.8);
    this._glow.strokeEllipse(0, -10, w + 14, h + 8);
    this._glow.setVisible(false);

    // Icon
    const icon = opts.scene.add.graphics();
    opts.draw(icon);

    // Floating label (hidden until hover)
    this._label = this._buildLabel(opts.scene, opts.label, -h - 6);
    this._label.setVisible(false);

    this.add([this._glow, icon, this._label]);
    opts.scene.add.existing(this);

    this.setDepth(IsometricSystem.depth(opts.worldX, opts.worldY));
    this.setData('interactable', true);

    // Interactive hit area
    this.setSize(w, h);
    this.setInteractive(
      new Phaser.Geom.Rectangle(-w / 2, -h, w, h),
      Phaser.Geom.Rectangle.Contains,
    );
    opts.scene.input.setTopOnly(true);

    this.on('pointerover', () => this._setHovered(true));
    this.on('pointerout', () => this._setHovered(false));
    this.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      if (pointer.button === 0) opts.onInteract();
    });
  }

  private _setHovered(hovered: boolean): void {
    this._glow.setVisible(hovered);
    this._label.setVisible(hovered);
    this.scene.input.setDefaultCursor(hovered ? 'pointer' : 'default');

    if (hovered && !this._glowTween) {
      this._glowTween = this.scene.tweens.add({
        targets: this._glow,
        alpha: { from: 0.55, to: 1 },
        duration: 600,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    } else if (!hovered && this._glowTween) {
      this._glowTween.stop();
      this._glowTween = null;
      this._glow.setAlpha(1);
    }
  }

  private _buildLabel(scene: Phaser.Scene, text: string, y: number): Phaser.GameObjects.Container {
    const label = scene.add.container(0, y);
    const txt = scene.add.text(0, 0, text, {
      fontSize: '11px',
      color: '#fff4d0',
      fontFamily: 'monospace',
    }).setOrigin(0.5);

    const padX = 6;
    const bg = scene.add.graphics();
    const w = txt.width + padX * 2;
    const hh = txt.height + 4;
    bg.fillStyle(0x1a1206, 0.92);
    bg.fillRoundedRect(-w / 2, -hh / 2, w, hh, 3);
    bg.lineStyle(1, 0xffe14d, 0.5);
    bg.strokeRoundedRect(-w / 2, -hh / 2, w, hh, 3);

    label.add([bg, txt]);
    return label;
  }

  destroy(fromScene?: boolean): void {
    this._glowTween?.stop();
    super.destroy(fromScene);
  }
}
