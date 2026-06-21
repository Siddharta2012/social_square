/**
 * BaseRoomScene
 * Abstract base for isometric scenes backed by a streamed sector world.
 *
 * Subclasses provide spawn data with getWorldConfig().
 */

import Phaser from 'phaser';
import { Avatar } from '../../entities/Avatar';
import { CameraSystem } from '../../systems/CameraSystem';
import { IsometricSystem } from '../../systems/IsometricSystem';
import { MovementSystem } from '../../systems/MovementSystem';
import { useGameStore } from '../../store/gameStore';
import { SectorLoader } from '../../world/SectorLoader';
import { SectorRenderer } from '../../world/SectorRenderer';
import { WorldMap } from '../../world/WorldMap';
import { WorldStreamer } from '../../world/WorldStreamer';
import { SECTOR_REGISTRY } from '../../world/sectors';

export interface WorldConfig {
  spawnX: number;
  spawnY: number;
  username?: string;
}

export abstract class BaseRoomScene extends Phaser.Scene {
  protected isoSystem!: IsometricSystem;
  protected movementSystem!: MovementSystem;
  protected cameraSystem!: CameraSystem;
  protected localAvatar!: Avatar;
  protected worldMap!: WorldMap;

  private _streamer!: WorldStreamer;
  private _renderer!: SectorRenderer;
  private _hoverGraphics!: Phaser.GameObjects.Graphics;
  private _hoveredTile: { x: number; y: number } | null = null;
  private _config!: WorldConfig;
  private _prevAvatarX = 0;
  private _prevAvatarY = 0;
  private _destroyed = false;
  private _nightOverlay!: Phaser.GameObjects.Graphics;
  private _ambientTime = 0;
  private _lastNightFactor = -1;

  protected abstract getWorldConfig(): WorldConfig;

  create(): void {
    this._destroyed = false;
    this._config = this.getWorldConfig();

    this.worldMap = new WorldMap();
    this._renderer = new SectorRenderer(this);
    this._streamer = new WorldStreamer(this.worldMap, new SectorLoader(SECTOR_REGISTRY), {
      onSectorReady: (data) => this._renderer.render(data),
      onSectorUnload: (sx, sy) => this._renderer.remove(sx, sy),
      onLoadingChange: (state) => useGameStore.getState().setWorldLoading(state),
    });

    this.isoSystem = new IsometricSystem();
    this.movementSystem = new MovementSystem(this.worldMap, 5);
    this.cameraSystem = new CameraSystem(this.cameras.main, {
      zoom: 1.5,
      minZoom: 0.5,
      maxZoom: 3,
    });

    this._hoverGraphics = this.add.graphics();
    this._hoverGraphics.setDepth(-0.5);
    this._nightOverlay = this.add.graphics();
    this._nightOverlay.setScrollFactor(0);
    this._nightOverlay.setDepth(900);

    void this._streamer.update(this._config.spawnX, this._config.spawnY).then(() => {
      if (this._destroyed) return;
      this._spawnAvatar();
      this._setupCamera();
    });

    this._setupInput();
    this._setupBackButton();

    this.scale.on('resize', (size: Phaser.Structs.Size) => {
      this.cameras.main.setSize(size.width, size.height);
      this._drawNightOverlay(Math.max(this._lastNightFactor, 0));
    });

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this._destroyed = true;
      this.destroyWorld();
    });
  }

  update(_time: number, delta: number): void {
    this._updateAtmosphere(delta / 1000);
    if (!this.localAvatar) return;

    this.movementSystem.update(delta / 1000);

    const newX = this.movementSystem.posX;
    const newY = this.movementSystem.posY;
    this.localAvatar.setWorldPosition(newX, newY);

    if (newX !== this._prevAvatarX || newY !== this._prevAvatarY) {
      const dx = newX - this._prevAvatarX;
      const dy = newY - this._prevAvatarY;
      this.localAvatar.setFacing(dx < 0 || (dx === 0 && dy > 0));
      this._prevAvatarX = newX;
      this._prevAvatarY = newY;
      void this._streamer.update(Math.round(newX), Math.round(newY));
    }

    this.localAvatar.playAnimation(this.movementSystem.isMoving ? 'walk' : 'idle');
    this.isoSystem.update();
    this._updateHoverHighlight();
  }

  protected onLocalMove(_x: number, _y: number, _moving: boolean): void {
    // Subclasses can mirror local movement to networking or analytics.
  }

  private _spawnAvatar(): void {
    const { spawnX, spawnY, username } = this._config;

    this.localAvatar = new Avatar({
      scene: this,
      username: username ?? 'Player',
      worldX: spawnX,
      worldY: spawnY,
      isLocal: true,
    });

    this._prevAvatarX = spawnX;
    this._prevAvatarY = spawnY;
    this.movementSystem.setPosition(spawnX, spawnY);
    this.isoSystem.register(this.localAvatar, spawnX, spawnY);

    this.movementSystem.onMove = (x, y, moving) => {
      this.isoSystem.updatePosition(this.localAvatar, x, y);
      this.onLocalMove(x, y, moving);
    };
  }

  private _setupInput(): void {
    this.input.on(Phaser.Input.Events.POINTER_UP, (pointer: Phaser.Input.Pointer) => {
      if (pointer.button !== 0) return;
      if (!this.localAvatar) return;

      const hits = this.input.hitTestPointer(pointer);
      if (hits.some((object) => object.getData('interactable'))) return;

      const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
      const world = IsometricSystem.isoToWorld(worldPoint.x, worldPoint.y);
      const tileX = Math.round(world.x);
      const tileY = Math.round(world.y);

      if (this.worldMap.isWalkable(tileX, tileY)) this._spawnClickRipple(tileX, tileY);
      this.movementSystem.moveTo(tileX, tileY);
    });

    this.cameraSystem.bindWheelZoom(this);
  }

  private _spawnClickRipple(tileX: number, tileY: number): void {
    const iso = IsometricSystem.worldToIso(tileX, tileY);
    const hw = IsometricSystem.TILE_HALF_W;
    const hh = IsometricSystem.TILE_HALF_H;
    const gfx = this.add.graphics();
    gfx.setDepth(-0.3);

    const state = { t: 0 };
    this.tweens.add({
      targets: state,
      t: 1,
      duration: 380,
      ease: 'Quad.easeOut',
      onUpdate: () => {
        const scale = 0.15 + state.t * 0.95;
        const alpha = (1 - state.t) * 0.75;
        gfx.clear();
        gfx.lineStyle(2, 0xffffff, alpha);
        gfx.strokePoints([
          { x: iso.x, y: iso.y - hh * scale },
          { x: iso.x + hw * scale, y: iso.y },
          { x: iso.x, y: iso.y + hh * scale },
          { x: iso.x - hw * scale, y: iso.y },
        ], true);
      },
      onComplete: () => gfx.destroy(),
    });
  }

  private _updateHoverHighlight(): void {
    const pointer = this.input.activePointer;
    const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    const world = IsometricSystem.isoToWorld(worldPoint.x, worldPoint.y);
    const tileX = Math.floor(world.x + 0.5);
    const tileY = Math.floor(world.y + 0.5);

    const tile = this.worldMap.getTile(tileX, tileY);
    if (tile === null || tile.visible === false) {
      this._hoverGraphics.clear();
      this._hoveredTile = null;
      return;
    }

    if (this._hoveredTile?.x === tileX && this._hoveredTile?.y === tileY) return;
    this._hoveredTile = { x: tileX, y: tileY };

    this._hoverGraphics.clear();
    const hoverColor = tile.walkable ? 0xffffff : 0xff4444;
    const iso = IsometricSystem.worldToIso(tileX, tileY);
    const hw = IsometricSystem.TILE_HALF_W;
    const hh = IsometricSystem.TILE_HALF_H;
    this._hoverGraphics.lineStyle(2, hoverColor, 0.8);
    this._hoverGraphics.strokePoints([
      { x: iso.x, y: iso.y - hh },
      { x: iso.x + hw, y: iso.y },
      { x: iso.x, y: iso.y + hh },
      { x: iso.x - hw, y: iso.y },
    ], true);
  }

  private _setupCamera(): void {
    this.cameraSystem.follow(this.localAvatar);
    this.cameraSystem.setLerp(1, 1);
  }

  private _updateAtmosphere(deltaSeconds: number): void {
    const cycleSeconds = 140;
    this._ambientTime = (this._ambientTime + deltaSeconds) % cycleSeconds;
    const daylightWave = (Math.sin((this._ambientTime / cycleSeconds) * Math.PI * 2 - Math.PI / 2) + 1) / 2;
    const nightFactor = Phaser.Math.Clamp((daylightWave - 0.45) / 0.55, 0, 1);

    if (Math.abs(nightFactor - this._lastNightFactor) < 0.01) return;
    this._lastNightFactor = nightFactor;
    this._renderer?.setNightFactor(nightFactor);
    this._drawNightOverlay(nightFactor);
  }

  private _drawNightOverlay(nightFactor: number): void {
    if (!this._nightOverlay) return;
    this._nightOverlay.clear();
    if (nightFactor <= 0.01) return;
    this._nightOverlay.fillStyle(0x05081f, nightFactor * 0.42);
    this._nightOverlay.fillRect(0, 0, this.scale.width, this.scale.height);
    this._nightOverlay.fillStyle(0x2c3f73, nightFactor * 0.08);
    this._nightOverlay.fillRect(0, 0, this.scale.width, this.scale.height);
  }

  private _setupBackButton(): void {
    const btn = this.add.text(16, 16, '< Menu', {
      fontSize: '14px',
      color: '#ffffff',
      fontFamily: 'monospace',
      backgroundColor: '#00000088',
      padding: { x: 8, y: 4 },
    })
      .setScrollFactor(0)
      .setDepth(1000)
      .setInteractive({ useHandCursor: true });

    btn.on('pointerover', () => btn.setStyle({ color: '#aaddff' }));
    btn.on('pointerout', () => btn.setStyle({ color: '#ffffff' }));
    btn.on('pointerup', () => this.scene.start('MenuScene'));
  }

  protected destroyWorld(): void {
    this._renderer?.destroyAll();
    useGameStore.getState().setWorldLoading(null);
  }
}
