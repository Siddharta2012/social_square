import type { Direction, AvatarState } from '@social-square/shared';
import { Avatar, type AvatarOptions } from './Avatar';

/** Deterministic color from username string. */
function colorFromUsername(username: string): number {
  let hash = 0;
  for (let i = 0; i < username.length; i++) {
    hash = username.charCodeAt(i) + ((hash << 5) - hash);
  }
  const palette = [
    0xff6b6b, // red
    0xffd93d, // yellow
    0x6bcb77, // green
    0xff922b, // orange
    0xcc5de8, // purple
    0x20c997, // teal
    0xf06595, // pink
    0x74c0fc, // light blue
  ];
  return palette[Math.abs(hash) % palette.length];
}

export class RemoteAvatar extends Avatar {
  private _targetWorldX: number;
  private _targetWorldY: number;
  private readonly _lerpFactor = 0.12;

  constructor(options: Omit<AvatarOptions, 'color' | 'isLocal'>) {
    super({ ...options, color: colorFromUsername(options.username), isLocal: false });
    this._targetWorldX = options.worldX;
    this._targetWorldY = options.worldY;
  }

  /** Called by the server with the remote user's new target position. */
  updateTarget(
    worldX: number,
    worldY: number,
    _direction: Direction,
    animState: AvatarState,
  ): void {
    this._targetWorldX = worldX;
    this._targetWorldY = worldY;
    if (animState === 'sit') {
      this.setWorldPosition(worldX, worldY);
      this.playAnimation('sit');
      return;
    }

    if (animState === 'wave' || animState === 'dance' || animState === 'clap') {
      this.playEmote(animState);
      return;
    }

    const moving =
      animState === 'walk' ||
      Math.abs(this._targetWorldX - this._worldX) > 0.15 ||
      Math.abs(this._targetWorldY - this._worldY) > 0.15;
    this.playAnimation(moving ? 'walk' : 'idle');
  }

  /** Call once per frame from the owning scene's update(). */
  tick(): void {
    const dx = this._targetWorldX - this._worldX;
    const dy = this._targetWorldY - this._worldY;

    if (Math.abs(dx) < 0.02 && Math.abs(dy) < 0.02) {
      if (this._worldX !== this._targetWorldX || this._worldY !== this._targetWorldY) {
        this.setWorldPosition(this._targetWorldX, this._targetWorldY);
        this.playAnimation('idle');
      }
      return;
    }

    // Update facing: in iso space, negative screen-x movement = facing left
    // iso.x = (worldX - worldY) * TILE_HALF_W → left when dx < 0 or dy > 0
    this.setFacing(dx < 0 || (dx === 0 && dy > 0));

    this.setWorldPosition(this._worldX + dx * this._lerpFactor, this._worldY + dy * this._lerpFactor);
  }
}
