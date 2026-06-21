/**
 * CameraSystem
 * Wraps Phaser camera with follow, zoom, and world bounds.
 */

import Phaser from 'phaser';

export interface CameraSystemOptions {
  /** Zoom level (default 1) */
  zoom?: number;
  /** Min zoom (default 0.5) */
  minZoom?: number;
  /** Max zoom (default 2) */
  maxZoom?: number;
  /** Lerp factor for follow (0-1, default 0.1) */
  lerpX?: number;
  lerpY?: number;
}

export class CameraSystem {
  private _camera: Phaser.Cameras.Scene2D.Camera;
  private _minZoom: number;
  private _maxZoom: number;
  private _target: Phaser.GameObjects.GameObject | null = null;

  constructor(camera: Phaser.Cameras.Scene2D.Camera, options: CameraSystemOptions = {}) {
    this._camera = camera;
    this._minZoom = options.minZoom ?? 0.5;
    this._maxZoom = options.maxZoom ?? 2;

    const zoom = options.zoom ?? 1;
    this._camera.setZoom(zoom);

    const lerpX = options.lerpX ?? 0.1;
    const lerpY = options.lerpY ?? 0.1;
    this._camera.setLerp(lerpX, lerpY);
  }

  /** Set world bounds so the camera doesn't scroll outside the map. */
  setBounds(x: number, y: number, width: number, height: number): void {
    this._camera.setBounds(x, y, width, height);
  }

  /** Start following a game object. */
  follow(target: Phaser.GameObjects.GameObject): void {
    this._target = target;
    this._camera.startFollow(target, true);
  }

  stopFollow(): void {
    this._target = null;
    this._camera.stopFollow();
  }

  /** Adjust zoom by delta (positive = zoom in, negative = zoom out). */
  adjustZoom(delta: number): void {
    const newZoom = Phaser.Math.Clamp(
      this._camera.zoom + delta,
      this._minZoom,
      this._maxZoom,
    );
    this._camera.setZoom(newZoom);
  }

  setZoom(zoom: number): void {
    this._camera.setZoom(Phaser.Math.Clamp(zoom, this._minZoom, this._maxZoom));
  }

  get zoom(): number {
    return this._camera.zoom;
  }

  get camera(): Phaser.Cameras.Scene2D.Camera {
    return this._camera;
  }

  /** Bind mouse-wheel zoom. Call once after scene input is ready. */
  bindWheelZoom(scene: Phaser.Scene): void {
    scene.input.on(
      Phaser.Input.Events.POINTER_WHEEL,
      (_pointer: Phaser.Input.Pointer, _gameObjects: unknown, _deltaX: number, deltaY: number) => {
        this.adjustZoom(-deltaY * 0.001);
      },
    );
  }
}
