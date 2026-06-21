import Phaser from 'phaser';
import type { AvatarState, EmoteId, HeldItem } from '@social-square/shared';
import { IsometricSystem } from '../systems/IsometricSystem';
import { SpeakingIndicator } from './SpeakingIndicator';

export interface AvatarOptions {
  scene: Phaser.Scene;
  username: string;
  worldX: number;
  worldY: number;
  color?: number;
  isLocal?: boolean;
}

export type AvatarAnimState = AvatarState;

export class Avatar extends Phaser.GameObjects.Container {
  readonly username: string;
  readonly isLocal: boolean;

  protected _worldX: number;
  protected _worldY: number;

  private _gfx: Phaser.GameObjects.Graphics;
  private _shadow: Phaser.GameObjects.Graphics;
  private _heldGfx: Phaser.GameObjects.Graphics;
  private _nametag: Phaser.GameObjects.Text;
  private _speakingIndicator: SpeakingIndicator;
  private _walkTween: Phaser.Tweens.Tween | null = null;
  private _animState: AvatarAnimState = 'idle';
  private _color: number;
  private _facingLeft = false;
  private _bodyScaleY = 1;
  private _heldItem: HeldItem = null;
  private _emoteText: Phaser.GameObjects.Text | null = null;

  static readonly SPRITE_W = 32;
  static readonly SPRITE_H = 48;

  constructor(options: AvatarOptions) {
    const iso = IsometricSystem.worldToIso(options.worldX, options.worldY);
    super(options.scene, iso.x, iso.y);

    this.username = options.username;
    this.isLocal = options.isLocal ?? false;
    this._worldX = options.worldX;
    this._worldY = options.worldY;
    this._color = options.color ?? (options.isLocal ? 0x4488ff : 0xff8844);

    // Ground shadow
    this._shadow = options.scene.add.graphics();
    this._shadow.fillStyle(0x000000, 0.1);
    this._shadow.fillEllipse(0, -2, 36, 12);
    this._shadow.fillStyle(0x000000, 0.18);
    this._shadow.fillEllipse(0, -3, 27, 8);

    // Human-shaped body (all drawn relative to feet at 0,0)
    this._gfx = options.scene.add.graphics();
    this._drawBody();

    // Held item graphics (beer / pretzel near the hand)
    this._heldGfx = options.scene.add.graphics();

    // Nametag above head
    this._nametag = options.scene.add.text(0, -Avatar.SPRITE_H - 10, options.username, {
      fontSize: '10px',
      color: '#ffffff',
      fontFamily: 'monospace',
      stroke: '#000000',
      strokeThickness: 3,
      resolution: 2,
    }).setOrigin(0.5, 1);

    this._speakingIndicator = new SpeakingIndicator(options.scene);

    this.add([this._shadow, this._gfx, this._heldGfx, this._nametag, this._speakingIndicator]);
    options.scene.add.existing(this);
    this.setDepth(IsometricSystem.depth(options.worldX, options.worldY));
  }

  // ── World position ────────────────────────────────────────────────────────

  get worldX(): number { return this._worldX; }
  get worldY(): number { return this._worldY; }

  setWorldPosition(worldX: number, worldY: number): void {
    this._worldX = worldX;
    this._worldY = worldY;
    const iso = IsometricSystem.worldToIso(worldX, worldY);
    this.setPosition(iso.x, iso.y);
    this.setDepth(IsometricSystem.depth(worldX, worldY));
  }

  // ── Facing direction ──────────────────────────────────────────────────────

  /** Flip body horizontally when moving left on screen. */
  setFacing(facingLeft: boolean): void {
    if (this._facingLeft === facingLeft) return;
    this._facingLeft = facingLeft;
    this._applyBodyScale();
  }

  // ── Animation ─────────────────────────────────────────────────────────────

  playAnimation(state: AvatarAnimState): void {
    if (state === 'wave' || state === 'dance' || state === 'clap') {
      this.playEmote(state);
      return;
    }

    if (this._animState === state) return;
    this._animState = state;
    if (state === 'walk') {
      this._setBodyPose(0, 1);
      this._startWalkBob();
    } else if (state === 'sit') {
      this._stopWalkBob();
      this._setBodyPose(7, 0.84);
    } else {
      this._stopWalkBob();
      this._setBodyPose(0, 1);
    }
  }

  playEmote(emoteId: EmoteId): void {
    this._showEmoteLabel(emoteId);

    if (emoteId === 'wave') {
      this.scene.tweens.add({
        targets: this._gfx,
        angle: { from: 0, to: this._facingLeft ? 8 : -8 },
        duration: 120,
        yoyo: true,
        repeat: 3,
        ease: 'Sine.easeInOut',
        onComplete: () => this._gfx.setAngle(0),
      });
    } else if (emoteId === 'dance') {
      this.scene.tweens.add({
        targets: [this._gfx, this._heldGfx],
        x: { from: -3, to: 3 },
        angle: { from: -4, to: 4 },
        duration: 140,
        yoyo: true,
        repeat: 5,
        ease: 'Sine.easeInOut',
        onComplete: () => {
          this._gfx.setX(0).setAngle(0);
          this._heldGfx.setX(0).setAngle(0);
        },
      });
    } else {
      this.scene.tweens.add({
        targets: this._heldGfx,
        scaleX: { from: 1, to: 1.25 },
        duration: 95,
        yoyo: true,
        repeat: 4,
        ease: 'Quad.easeInOut',
        onComplete: () => this._heldGfx.setScale(1),
      });
    }
  }

  setSpeaking(speaking: boolean): void {
    speaking ? this._speakingIndicator.show() : this._speakingIndicator.hide();
  }

  // ── Held item ───────────────────────────────────────────────────────────────

  get heldItem(): HeldItem { return this._heldItem; }

  /** @param fill 0..1 — remaining beer level (ignored for pretzel). */
  setHeldItem(item: HeldItem, fill = 1): void {
    this._heldItem = item;
    this._drawHeldItem(fill);
  }

  /** Quick tilt animation when drinking/eating. */
  consume(): void {
    this.scene.tweens.add({
      targets: [this._gfx, this._heldGfx],
      angle: { from: 0, to: -10 },
      duration: 160,
      yoyo: true,
      ease: 'Sine.easeInOut',
    });
  }

  private _drawHeldItem(fill: number): void {
    const g = this._heldGfx;
    g.clear();
    if (!this._heldItem) return;

    // Hand position (right side of body)
    const hx = 13;
    const hy = -24;

    if (this._heldItem === 'beer') {
      // Glass
      g.fillStyle(0xffe9a8, 0.25);
      g.fillRoundedRect(hx - 4, hy - 8, 9, 14, 2);
      // Beer liquid (proportional to fill)
      const liquidH = Math.max(0, 12 * fill);
      g.fillStyle(0xf5a623, 1);
      g.fillRect(hx - 3, hy + 5 - liquidH, 7, liquidH);
      // Foam
      if (fill > 0.05) {
        g.fillStyle(0xfff4e0, 1);
        g.fillEllipse(hx + 0.5, hy - 7 + (12 - liquidH), 8, 3);
      }
      // Glass outline + handle
      g.lineStyle(1, 0xffffff, 0.55);
      g.strokeRoundedRect(hx - 4, hy - 8, 9, 14, 2);
      g.strokeCircle(hx + 7, hy - 1, 3);
    } else if (this._heldItem === 'pretzel') {
      // Pretzel — brown knotted shape
      g.lineStyle(3, 0x8a4b1e, 1);
      g.strokeCircle(hx - 2, hy, 4);
      g.strokeCircle(hx + 3, hy, 4);
      g.lineStyle(3, 0x9c5a28, 1);
      g.beginPath();
      g.arc(hx + 0.5, hy + 2, 5, Phaser.Math.DegToRad(20), Phaser.Math.DegToRad(160), false);
      g.strokePath();
      // Salt specks
      g.fillStyle(0xffffff, 0.9);
      g.fillCircle(hx - 2, hy - 1, 0.7);
      g.fillCircle(hx + 3, hy + 1, 0.7);
    }
  }

  // ── Drawing ───────────────────────────────────────────────────────────────

  private _drawBody(): void {
    const g = this._gfx;
    g.clear();
    const c = this._color;

    // Derive a darker leg/pants color from body color
    const lr = Math.max(0, ((c >> 16) & 0xff) - 50);
    const lg = Math.max(0, ((c >> 8) & 0xff) - 50);
    const lb = Math.max(0, (c & 0xff) - 50);
    const legColor = (lr << 16) | (lg << 8) | lb;

    // Legs (two pillars)
    g.fillStyle(legColor, 1);
    g.fillRect(-9, -16, 7, 16);
    g.fillRect(2, -16, 7, 16);
    // Leg inner shadow
    g.fillStyle(0x000000, 0.1);
    g.fillRect(0, -16, 2, 16);

    // Torso / shirt
    g.fillStyle(c, 1);
    g.fillRoundedRect(-11, -35, 22, 20, 4);
    // Shirt highlight (simulates top lighting)
    g.fillStyle(0xffffff, 0.15);
    g.fillRect(-10, -34, 9, 7);
    // Torso outline
    g.lineStyle(1, 0x000000, 0.3);
    g.strokeRoundedRect(-11, -35, 22, 20, 4);

    // Head (skin tone)
    g.fillStyle(0xfdb89c, 1);
    g.fillCircle(0, -44, 9);
    // Head shading on one side
    g.fillStyle(0x000000, 0.08);
    g.fillCircle(4, -44, 7);
    // Head outline
    g.lineStyle(1, 0x000000, 0.28);
    g.strokeCircle(0, -44, 9);

    // Eyes
    g.fillStyle(0x2d1a0e, 1);
    g.fillCircle(-3.5, -45, 1.5);
    g.fillCircle(3.5, -45, 1.5);

    // Eye shine
    g.fillStyle(0xffffff, 0.7);
    g.fillCircle(-2.8, -45.7, 0.6);
    g.fillCircle(4.2, -45.7, 0.6);
  }

  private _setBodyPose(y: number, scaleY: number): void {
    this._bodyScaleY = scaleY;
    this._gfx.setY(y);
    this._heldGfx.setY(y);
    this._applyBodyScale();
  }

  private _applyBodyScale(): void {
    this._gfx.setScale(this._facingLeft ? -1 : 1, this._bodyScaleY);
  }

  private _showEmoteLabel(emoteId: EmoteId): void {
    const label = emoteId === 'wave' ? 'HI' : emoteId === 'dance' ? 'DANCE' : 'CLAP';
    if (!this._emoteText) {
      this._emoteText = this.scene.add.text(0, -Avatar.SPRITE_H - 26, label, {
        fontSize: '10px',
        color: '#fff4d0',
        fontFamily: 'monospace',
        stroke: '#201006',
        strokeThickness: 3,
        resolution: 2,
      }).setOrigin(0.5, 1);
      this.add(this._emoteText);
    }

    this._emoteText.setText(label);
    this._emoteText.setAlpha(1);
    this._emoteText.setY(-Avatar.SPRITE_H - 26);
    this.scene.tweens.add({
      targets: this._emoteText,
      y: -Avatar.SPRITE_H - 42,
      alpha: 0,
      duration: 850,
      ease: 'Quad.easeOut',
    });
  }

  private _startWalkBob(): void {
    if (this._walkTween) return;
    this._walkTween = this.scene.tweens.add({
      targets: [this._gfx, this._heldGfx],
      y: { from: -2, to: 2 },
      duration: 210,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  private _stopWalkBob(): void {
    if (this._walkTween) {
      this._walkTween.stop();
      this._walkTween = null;
    }
  }

  // ── Cleanup ───────────────────────────────────────────────────────────────

  destroy(fromScene?: boolean): void {
    this._stopWalkBob();
    super.destroy(fromScene);
  }
}
