/**
 * Avatar entity
 * Phaser Container with:
 *  - Placeholder body rectangle (32x48 px, origin at feet = bottom-center)
 *  - Nametag text above the sprite
 *  - Simple walk/idle visual state (tween-based bob for walk)
 *
 * Origin convention: container position = feet of avatar on the iso tile.
 * The body rect is offset so its bottom-center aligns with (0,0) of the container.
 */

import Phaser from 'phaser';
import { IsometricSystem } from '../systems/IsometricSystem';
import { SpeakingIndicator } from './SpeakingIndicator';

export interface AvatarOptions {
  scene: Phaser.Scene;
  username: string;
  /** Grid world position */
  worldX: number;
  worldY: number;
  /** Fill color for the placeholder body rectangle */
  color?: number;
  isLocal?: boolean;
}

export type AvatarAnimState = 'idle' | 'walk';

export class Avatar extends Phaser.GameObjects.Container {
  readonly username: string;
  readonly isLocal: boolean;

  protected _worldX: number;
  protected _worldY: number;

  private _body: Phaser.GameObjects.Rectangle;
  private _nametag: Phaser.GameObjects.Text;
  private _speakingIndicator: SpeakingIndicator;
  private _walkTween: Phaser.Tweens.Tween | null = null;
  private _animState: AvatarAnimState = 'idle';

  /** Sprite dimensions */
  static readonly SPRITE_W = 32;
  static readonly SPRITE_H = 48;

  constructor(options: AvatarOptions) {
    const iso = IsometricSystem.worldToIso(options.worldX, options.worldY);
    super(options.scene, iso.x, iso.y);

    this.username = options.username;
    this.isLocal = options.isLocal ?? false;
    this._worldX = options.worldX;
    this._worldY = options.worldY;

    const color = options.color ?? (options.isLocal ? 0x4488ff : 0xff8844);

    // Body rectangle — bottom-center at (0,0)
    this._body = options.scene.add.rectangle(
      0,
      -Avatar.SPRITE_H / 2,   // center of rect is half-height above feet
      Avatar.SPRITE_W,
      Avatar.SPRITE_H,
      color,
    );
    this._body.setStrokeStyle(1, 0xffffff, 0.4);

    // Nametag
    this._nametag = options.scene.add.text(0, -Avatar.SPRITE_H - 6, options.username, {
      fontSize: '10px',
      color: '#ffffff',
      fontFamily: 'monospace',
      stroke: '#000000',
      strokeThickness: 3,
      resolution: 2,
    }).setOrigin(0.5, 1);

    this._speakingIndicator = new SpeakingIndicator(options.scene);

    this.add([this._body, this._nametag, this._speakingIndicator]);

    // Register with scene
    options.scene.add.existing(this);

    // Set initial depth
    this.setDepth(IsometricSystem.depth(options.worldX, options.worldY));
  }

  // -----------------------------------------------------------------------
  // World position
  // -----------------------------------------------------------------------

  get worldX(): number { return this._worldX; }
  get worldY(): number { return this._worldY; }

  /** Move avatar to grid position, updating screen coords and depth. */
  setWorldPosition(worldX: number, worldY: number): void {
    this._worldX = worldX;
    this._worldY = worldY;
    const iso = IsometricSystem.worldToIso(worldX, worldY);
    this.setPosition(iso.x, iso.y);
    this.setDepth(IsometricSystem.depth(worldX, worldY));
  }

  // -----------------------------------------------------------------------
  // Animation state
  // -----------------------------------------------------------------------

  playAnimation(state: AvatarAnimState): void {
    if (this._animState === state) return;
    this._animState = state;

    if (state === 'walk') {
      this._startWalkBob();
    } else {
      this._stopWalkBob();
    }
  }

  setSpeaking(speaking: boolean): void {
    speaking ? this._speakingIndicator.show() : this._speakingIndicator.hide();
  }

  private _startWalkBob(): void {
    if (this._walkTween) return;
    this._walkTween = this.scene.tweens.add({
      targets: this._body,
      y: { from: -Avatar.SPRITE_H / 2 - 2, to: -Avatar.SPRITE_H / 2 + 2 },
      duration: 200,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  private _stopWalkBob(): void {
    if (this._walkTween) {
      this._walkTween.stop();
      this._walkTween = null;
      this._body.setY(-Avatar.SPRITE_H / 2);
    }
  }

  // -----------------------------------------------------------------------
  // Cleanup
  // -----------------------------------------------------------------------

  destroy(fromScene?: boolean): void {
    this._stopWalkBob();
    super.destroy(fromScene);
  }
}
