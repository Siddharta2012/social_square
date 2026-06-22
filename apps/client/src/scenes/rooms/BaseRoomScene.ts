/**
 * BaseRoomScene
 * Abstract base for isometric scenes backed by a streamed sector world.
 *
 * Subclasses provide spawn data with getWorldConfig().
 */

import Phaser from 'phaser';
import { Avatar } from '../../entities/Avatar';
import { useGameStore, type WorldDebugMetrics } from '../../store/gameStore';
import { useUserStore } from '../../store/userStore';
import { CameraSystem } from '../../systems/CameraSystem';
import { IsometricSystem } from '../../systems/IsometricSystem';
import { MovementSystem } from '../../systems/MovementSystem';
import { globalToSector, sectorKey } from '../../world/coords';
import { SectorLoader } from '../../world/SectorLoader';
import { SectorRenderer } from '../../world/SectorRenderer';
import { SECTOR_REGISTRY } from '../../world/sectors';
import { WorldMap } from '../../world/WorldMap';
import { WorldStreamer } from '../../world/WorldStreamer';
import type { AvatarState } from '@social-square/shared';

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
  private _cursorKeys: Phaser.Types.Input.Keyboard.CursorKeys | null = null;
  private _wasdKeys: Record<'up' | 'down' | 'left' | 'right', Phaser.Input.Keyboard.Key> | null = null;
  private _keyboardStepCooldown = 0;
  private _keyboardDriving = false;
  private _localAvatarStateOverride: AvatarState | null = null;
  private _atmosphereElapsed = 0;
  private _hoverElapsed = 0;
  private _debugElapsed = 0;
  private _debugFrames = 0;
  private _debugFps = 0;
  private _lastFrameMs = 0;
  private _lastStreamSectorKey: string | null = null;
  private _lastHoverSampleKey = '';

  protected abstract getWorldConfig(): WorldConfig;

  create(): void {
    this._destroyed = false;
    this._config = this.getWorldConfig();

    this.worldMap = new WorldMap();
    this._renderer = new SectorRenderer(this);
    this._streamer = new WorldStreamer(this.worldMap, new SectorLoader(SECTOR_REGISTRY), {
      onSectorReady: (data) => {
        this._renderer.render(data);
        this._lastHoverSampleKey = '';
      },
      onSectorUnload: (sx, sy) => {
        this._renderer.remove(sx, sy);
        this._lastHoverSampleKey = '';
      },
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

    void (this._streamWorldAt(this._config.spawnX, this._config.spawnY, true) ?? Promise.resolve()).then(() => {
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
    const deltaSeconds = delta / 1000;
    this._updateAtmosphereThrottled(deltaSeconds);
    if (!this.localAvatar) {
      this._publishDebugMetrics(delta);
      return;
    }

    this._updateKeyboardMovement(deltaSeconds);
    this.movementSystem.update(deltaSeconds);

    const newX = this.movementSystem.posX;
    const newY = this.movementSystem.posY;

    if (newX !== this._prevAvatarX || newY !== this._prevAvatarY) {
      this.localAvatar.setWorldPosition(newX, newY);
      const dx = newX - this._prevAvatarX;
      const dy = newY - this._prevAvatarY;
      this.localAvatar.setFacing(dx < 0 || (dx === 0 && dy > 0));
      this._prevAvatarX = newX;
      this._prevAvatarY = newY;
      void this._streamWorldAt(Math.round(newX), Math.round(newY));
    }

    this.localAvatar.playAnimation(this._currentAvatarState());
    this.isoSystem.update();
    this._hoverElapsed += deltaSeconds;
    if (this._hoverElapsed >= 0.05) {
      this._hoverElapsed = 0;
      this._updateHoverHighlight();
    }
    this._publishDebugMetrics(delta);
  }

  protected onLocalMove(_x: number, _y: number, _moving: boolean): void {
    // Subclasses can mirror local movement to networking or analytics.
  }

  protected onLocalMoveCommand(_targetX: number, _targetY: number): void {
    // Subclasses can leave seats or cancel local actions before pathing starts.
  }

  protected onTileInteract(_tileX: number, _tileY: number): boolean {
    return false;
  }

  protected isLocalMovementLocked(): boolean {
    return false;
  }

  protected collectDebugExtras(): Record<string, string | number | boolean | null> {
    return {};
  }

  protected setLocalAvatarState(state: AvatarState | null): void {
    this._localAvatarStateOverride = state;
    useGameStore.getState().setLocalAvatarState(state ?? 'idle');
  }

  protected setLocalAvatarTile(x: number, y: number, state: AvatarState | null = null): void {
    if (!this.localAvatar) return;
    this.movementSystem.setPosition(x, y);
    this.localAvatar.setWorldPosition(x, y);
    this.isoSystem.updatePosition(this.localAvatar, x, y);
    this._prevAvatarX = x;
    this._prevAvatarY = y;
    this.setLocalAvatarState(state);
  }

  protected refreshWorldAt(x: number, y: number): Promise<void> {
    return this._streamWorldAt(Math.round(x), Math.round(y), true) ?? Promise.resolve();
  }

  private _spawnAvatar(): void {
    const { spawnX, spawnY, username } = this._config;
    const savedAvatar = useUserStore.getState().avatarConfig;

    this.localAvatar = new Avatar({
      scene: this,
      username: username ?? 'Player',
      worldX: spawnX,
      worldY: spawnY,
      isLocal: true,
      avatarConfig: savedAvatar ?? undefined,
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
      if (this.isLocalMovementLocked()) return;

      const hits = this.input.hitTestPointer(pointer);
      if (hits.some((object) => object.getData('interactable'))) return;

      const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
      const world = IsometricSystem.isoToWorld(worldPoint.x, worldPoint.y);
      const tileX = Math.round(world.x);
      const tileY = Math.round(world.y);

      if (this.onTileInteract(tileX, tileY)) return;
      this._tryMoveToTile(tileX, tileY, true);
    });

    this._cursorKeys = this.input.keyboard?.createCursorKeys() ?? null;
    this._wasdKeys = this.input.keyboard?.addKeys({
      up: Phaser.Input.Keyboard.KeyCodes.W,
      down: Phaser.Input.Keyboard.KeyCodes.S,
      left: Phaser.Input.Keyboard.KeyCodes.A,
      right: Phaser.Input.Keyboard.KeyCodes.D,
    }) as Record<'up' | 'down' | 'left' | 'right', Phaser.Input.Keyboard.Key> | null;

    this.input.keyboard?.on('keydown-F3', this._toggleDebugOverlay, this);
    this.cameraSystem.bindWheelZoom(this);
  }

  private _tryMoveToTile(tileX: number, tileY: number, ripple: boolean): boolean {
    if (this.isLocalMovementLocked()) {
      this.movementSystem.stopMovement();
      return false;
    }

    if (!this.worldMap.isWalkable(tileX, tileY)) {
      this.movementSystem.moveTo(tileX, tileY);
      return false;
    }

    this.onLocalMoveCommand(tileX, tileY);
    const started = this.movementSystem.moveTo(tileX, tileY);
    if (!started) return false;

    this.setLocalAvatarState(null);
    if (ripple) this._spawnClickRipple(tileX, tileY);
    return true;
  }

  private _updateKeyboardMovement(deltaSeconds: number): void {
    if (!this._cursorKeys || !this._wasdKeys || this._isDomTextInputFocused()) return;

    this._keyboardStepCooldown = Math.max(0, this._keyboardStepCooldown - deltaSeconds);

    const left = this._cursorKeys.left.isDown || this._wasdKeys.left.isDown;
    const right = this._cursorKeys.right.isDown || this._wasdKeys.right.isDown;
    const up = this._cursorKeys.up.isDown || this._wasdKeys.up.isDown;
    const down = this._cursorKeys.down.isDown || this._wasdKeys.down.isDown;

    const dx = (right ? 1 : 0) - (left ? 1 : 0);
    const dy = (down ? 1 : 0) - (up ? 1 : 0);

    if (dx === 0 && dy === 0) {
      this._keyboardDriving = false;
      return;
    }

    if (this.movementSystem.isMoving && !this._keyboardDriving) {
      this.movementSystem.stopMovement();
    }
    if (this.movementSystem.isMoving || this._keyboardStepCooldown > 0) return;

    const stepX = dx !== 0 ? dx : 0;
    const stepY = dx === 0 ? dy : 0;
    const targetX = Math.round(this.movementSystem.posX) + stepX;
    const targetY = Math.round(this.movementSystem.posY) + stepY;

    if (this._tryMoveToTile(targetX, targetY, false)) {
      this._keyboardDriving = true;
      this._keyboardStepCooldown = 0.03;
    }
  }

  private _isDomTextInputFocused(): boolean {
    const active = document.activeElement as HTMLElement | null;
    const tag = active?.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
  }

  private _currentAvatarState(): AvatarState {
    if (this._localAvatarStateOverride) return this._localAvatarStateOverride;
    return this.movementSystem.isMoving ? 'walk' : 'idle';
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
    const camera = this.cameras.main;
    const sampleKey = `${Math.round(pointer.x)}:${Math.round(pointer.y)}:${Math.round(camera.scrollX)}:${Math.round(camera.scrollY)}:${camera.zoom.toFixed(2)}`;
    if (sampleKey === this._lastHoverSampleKey) return;
    this._lastHoverSampleKey = sampleKey;

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

  private _updateAtmosphereThrottled(deltaSeconds: number): void {
    this._atmosphereElapsed += deltaSeconds;
    if (this._lastNightFactor >= 0 && this._atmosphereElapsed < 0.2) return;
    const elapsed = this._atmosphereElapsed;
    this._atmosphereElapsed = 0;
    this._updateAtmosphere(elapsed);
  }

  private _publishDebugMetrics(deltaMs: number): void {
    this._lastFrameMs = deltaMs;
    this._debugElapsed += deltaMs;
    this._debugFrames += 1;

    if (this._debugElapsed >= 500) {
      this._debugFps = Math.round((this._debugFrames * 1000) / this._debugElapsed);
      this._debugElapsed = 0;
      this._debugFrames = 0;
    }

    const store = useGameStore.getState();
    if (!store.showDebugOverlay || !this._streamer || !this._renderer || !this.worldMap || !this.isoSystem) return;

    const stream = this._streamer.stats();
    const renderer = this._renderer.stats();
    const world = this.worldMap.stats();
    const iso = this.isoSystem.stats();
    const localTile = this.localAvatar
      ? `${Math.round(this.movementSystem.posX)},${Math.round(this.movementSystem.posY)}`
      : null;

    const metrics: WorldDebugMetrics = {
      fps: this._debugFps,
      frameMs: Math.round(this._lastFrameMs * 10) / 10,
      locationName: store.locationName,
      routeHint: store.routeHint,
      worldLoading: store.worldLoading,
      activeSectors: stream.activeKeys.length,
      loadedSectors: stream.loadedKeys.length,
      inFlightSectors: stream.inFlightKeys.length,
      renderedSectors: renderer.sectors,
      worldSectors: world.sectors,
      decorations: renderer.decorations,
      lights: renderer.lights,
      isoObjects: iso.objects,
      isoDirty: iso.dirty,
      localTile,
      extra: this.collectDebugExtras(),
    };

    store.setWorldDebugMetrics(metrics);
  }

  private _toggleDebugOverlay(): void {
    if (this._isDomTextInputFocused()) return;
    useGameStore.getState().toggleDebugOverlay();
  }

  private _streamWorldAt(tileX: number, tileY: number, force = false): Promise<void> | null {
    const key = sectorKey(globalToSector(tileX), globalToSector(tileY));
    if (!force && key === this._lastStreamSectorKey) return null;
    this._lastStreamSectorKey = key;
    return this._streamer.update(tileX, tileY);
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
    this.input.keyboard?.off('keydown-F3', this._toggleDebugOverlay, this);
    this._streamer?.destroy();
    this._renderer?.destroyAll();
    this.worldMap?.clear();
    this.isoSystem?.clear();
    this._lastStreamSectorKey = null;
    this._lastHoverSampleKey = '';
    this._hoverGraphics?.clear();
    this._nightOverlay?.clear();
    const store = useGameStore.getState();
    store.setWorldLoading(null);
    store.setTravelTargetName(null);
    store.setWorldDebugMetrics(null);
    store.setLocalAvatarState('idle');
  }
}
