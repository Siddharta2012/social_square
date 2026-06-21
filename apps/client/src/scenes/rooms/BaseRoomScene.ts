/**
 * BaseRoomScene
 * Abstract base for all isometric room scenes.
 *
 * Responsibilities:
 *  - Build and draw the isometric tile grid (placeholder diamond shapes)
 *  - Manage IsometricSystem, MovementSystem, CameraSystem
 *  - Spawn the local avatar
 *  - Handle click-to-move input
 *  - Integrate depth sorting each frame
 *
 * Subclasses must implement:
 *  - getRoomConfig(): grid dimensions, obstacles, tile colors
 */

import Phaser from 'phaser';
import { IsometricSystem } from '../../systems/IsometricSystem';
import { MovementSystem } from '../../systems/MovementSystem';
import { CameraSystem } from '../../systems/CameraSystem';
import { Avatar } from '../../entities/Avatar';

export interface TileData {
  walkable: boolean;
  color: number;
  /** Optional highlight color for obstacles */
  topColor?: number;
}

export interface RoomConfig {
  cols: number;
  rows: number;
  tiles: TileData[][];
  spawnX: number;
  spawnY: number;
  username?: string;
}

export abstract class BaseRoomScene extends Phaser.Scene {
  protected isoSystem!: IsometricSystem;
  protected movementSystem!: MovementSystem;
  protected cameraSystem!: CameraSystem;
  protected localAvatar!: Avatar;

  /** Tile graphics layer (below avatars) */
  private _tileLayer!: Phaser.GameObjects.Graphics;
  /** Hover highlight graphics */
  private _hoverGraphics!: Phaser.GameObjects.Graphics;

  private _roomConfig!: RoomConfig;
  private _grid!: boolean[][];

  /** Currently hovered tile */
  private _hoveredTile: { x: number; y: number } | null = null;

  /** Previous avatar world position for facing direction */
  private _prevAvatarX = 0;
  private _prevAvatarY = 0;

  protected abstract getRoomConfig(): RoomConfig;

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------

  create(): void {
    this._roomConfig = this.getRoomConfig();
    this._buildGrid();

    this.isoSystem = new IsometricSystem();
    this.movementSystem = new MovementSystem(this._grid, 5);
    this.cameraSystem = new CameraSystem(this.cameras.main, {
      zoom: 1.5,
      minZoom: 0.5,
      maxZoom: 3,
      lerpX: 0.08,
      lerpY: 0.08,
    });

    this._drawTiles();
    this._spawnAvatar();
    this._setupInput();
    this._setupCamera();
    this._setupBackButton();

    // Resize handler
    this.scale.on('resize', (size: Phaser.Structs.Size) => {
      this.cameras.main.setSize(size.width, size.height);
    });
  }

  update(_time: number, delta: number): void {
    // Update movement (delta is in ms, convert to seconds)
    this.movementSystem.update(delta / 1000);

    // Sync avatar screen position from movement system
    const newX = this.movementSystem.posX;
    const newY = this.movementSystem.posY;
    this.localAvatar.setWorldPosition(newX, newY);

    // Update facing direction based on movement delta
    if (newX !== this._prevAvatarX || newY !== this._prevAvatarY) {
      const dx = newX - this._prevAvatarX;
      const dy = newY - this._prevAvatarY;
      this.localAvatar.setFacing(dx < 0 || (dx === 0 && dy > 0));
      this._prevAvatarX = newX;
      this._prevAvatarY = newY;
    }

    // Update animation state
    this.localAvatar.playAnimation(this.movementSystem.isMoving ? 'walk' : 'idle');

    // Depth sort
    this.isoSystem.update();

    // Hover highlight
    this._updateHoverHighlight();
  }

  // -----------------------------------------------------------------------
  // Grid
  // -----------------------------------------------------------------------

  private _buildGrid(): void {
    const { rows, cols, tiles } = this._roomConfig;
    this._grid = [];
    for (let row = 0; row < rows; row++) {
      this._grid[row] = [];
      for (let col = 0; col < cols; col++) {
        this._grid[row][col] = tiles[row]?.[col]?.walkable ?? true;
      }
    }
  }

  // -----------------------------------------------------------------------
  // Tile drawing
  // -----------------------------------------------------------------------

  private _drawTiles(): void {
    const { rows, cols, tiles } = this._roomConfig;

    this._tileLayer = this.add.graphics();
    this._hoverGraphics = this.add.graphics();

    // Draw tiles from back to front (painter's order)
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const tile = tiles[row]?.[col];
        const color = tile?.color ?? 0x336633;
        const walkable = tile?.walkable ?? true;

        this._drawTile(this._tileLayer, col, row, color, walkable);
      }
    }

    // Tile layer depth: below everything (depth = -1)
    this._tileLayer.setDepth(-1);
    this._hoverGraphics.setDepth(-0.5);
  }

  private _drawTile(
    gfx: Phaser.GameObjects.Graphics,
    col: number,
    row: number,
    fillColor: number,
    walkable: boolean,
  ): void {
    const iso = IsometricSystem.worldToIso(col, row);
    const hw = IsometricSystem.TILE_HALF_W;
    const hh = IsometricSystem.TILE_HALF_H;

    // Diamond vertices (top, right, bottom, left)
    const top    = { x: iso.x,      y: iso.y - hh };
    const right  = { x: iso.x + hw, y: iso.y };
    const bottom = { x: iso.x,      y: iso.y + hh };
    const left   = { x: iso.x - hw, y: iso.y };

    gfx.fillStyle(fillColor, 1);
    gfx.fillPoints([top, right, bottom, left], true);

    if (walkable) {
      // Bevel lighting: top-left edges catch light, bottom-right are in shadow
      gfx.lineStyle(1.5, 0xffffff, 0.13);
      gfx.lineBetween(left.x, left.y, top.x, top.y);
      gfx.lineBetween(top.x, top.y, right.x, right.y);
      gfx.lineStyle(1.5, 0x000000, 0.18);
      gfx.lineBetween(right.x, right.y, bottom.x, bottom.y);
      gfx.lineBetween(bottom.x, bottom.y, left.x, left.y);
    } else {
      gfx.lineStyle(1, 0x000000, 0.5);
      gfx.strokePoints([top, right, bottom, left], true);
    }

    // Obstacle top face (slightly raised look)
    if (!walkable) {
      const topColor = 0x884422;
      const lift = 8;
      const topTop    = { x: iso.x,      y: iso.y - hh - lift };
      const topRight  = { x: iso.x + hw, y: iso.y - lift };
      const topBottom = { x: iso.x,      y: iso.y + hh - lift };
      const topLeft   = { x: iso.x - hw, y: iso.y - lift };

      gfx.fillStyle(topColor, 1);
      gfx.fillPoints([topTop, topRight, topBottom, topLeft], true);
      gfx.lineStyle(1, 0x000000, 0.4);
      gfx.strokePoints([topTop, topRight, topBottom, topLeft], true);

      // Side faces
      gfx.fillStyle(0x663311, 1);
      gfx.fillPoints([topRight, right, bottom, topBottom], true);
      gfx.fillStyle(0x552200, 1);
      gfx.fillPoints([topLeft, left, bottom, topBottom], true);
    }
  }

  private _updateHoverHighlight(): void {
    const pointer = this.input.activePointer;
    const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    const world = IsometricSystem.isoToWorld(worldPoint.x, worldPoint.y);
    const tileX = Math.floor(world.x + 0.5);
    const tileY = Math.floor(world.y + 0.5);

    const { cols, rows } = this._roomConfig;
    if (tileX < 0 || tileY < 0 || tileX >= cols || tileY >= rows) {
      this._hoverGraphics.clear();
      this._hoveredTile = null;
      return;
    }

    if (this._hoveredTile?.x === tileX && this._hoveredTile?.y === tileY) return;
    this._hoveredTile = { x: tileX, y: tileY };

    this._hoverGraphics.clear();
    const walkable = this._grid[tileY]?.[tileX] ?? false;
    const hoverColor = walkable ? 0xffffff : 0xff4444;

    const iso = IsometricSystem.worldToIso(tileX, tileY);
    const hw = IsometricSystem.TILE_HALF_W;
    const hh = IsometricSystem.TILE_HALF_H;

    this._hoverGraphics.lineStyle(2, hoverColor, 0.8);
    this._hoverGraphics.strokePoints([
      { x: iso.x,      y: iso.y - hh },
      { x: iso.x + hw, y: iso.y },
      { x: iso.x,      y: iso.y + hh },
      { x: iso.x - hw, y: iso.y },
    ], true);
  }

  // -----------------------------------------------------------------------
  // Avatar
  // -----------------------------------------------------------------------

  private _spawnAvatar(): void {
    const { spawnX, spawnY, username } = this._roomConfig;

    this.localAvatar = new Avatar({
      scene: this,
      username: username ?? 'Player',
      worldX: spawnX,
      worldY: spawnY,
      isLocal: true,
    });

    this.movementSystem.setPosition(spawnX, spawnY);

    // Register with iso system for depth sorting
    this.isoSystem.register(this.localAvatar, spawnX, spawnY);

    // Keep iso system in sync when avatar moves
    this.movementSystem.onMove = (x, y, _moving) => {
      this.isoSystem.updatePosition(this.localAvatar, x, y);
    };
  }

  // -----------------------------------------------------------------------
  // Input
  // -----------------------------------------------------------------------

  private _setupInput(): void {
    this.input.on(
      Phaser.Input.Events.POINTER_UP,
      (pointer: Phaser.Input.Pointer) => {
        // Only handle left-click on the game canvas (not UI)
        if (pointer.button !== 0) return;

        // Skip movement if an interactive station was clicked
        const hits = this.input.hitTestPointer(pointer);
        if (hits.some((o) => o.getData('interactable'))) return;

        const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
        const world = IsometricSystem.isoToWorld(worldPoint.x, worldPoint.y);
        const tileX = Math.round(world.x);
        const tileY = Math.round(world.y);

        const { cols, rows } = this._roomConfig;
        if (tileX < 0 || tileY < 0 || tileX >= cols || tileY >= rows) return;

        if (this._grid[tileY]?.[tileX]) {
          this._spawnClickRipple(tileX, tileY);
        }
        this.movementSystem.moveTo(tileX, tileY);
      },
    );

    // Wheel zoom
    this.cameraSystem.bindWheelZoom(this);
  }

  // -----------------------------------------------------------------------
  // Click ripple
  // -----------------------------------------------------------------------

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
        const s = 0.15 + state.t * 0.95;
        const alpha = (1 - state.t) * 0.75;
        gfx.clear();
        gfx.lineStyle(2, 0xffffff, alpha);
        gfx.strokePoints([
          { x: iso.x,          y: iso.y - hh * s },
          { x: iso.x + hw * s, y: iso.y },
          { x: iso.x,          y: iso.y + hh * s },
          { x: iso.x - hw * s, y: iso.y },
        ], true);
      },
      onComplete: () => gfx.destroy(),
    });
  }

  // -----------------------------------------------------------------------
  // Camera
  // -----------------------------------------------------------------------

  private _setupCamera(): void {
    // Compute world bounds from grid extents
    const { cols, rows } = this._roomConfig;
    const topLeft     = IsometricSystem.worldToIso(0, 0);
    const topRight    = IsometricSystem.worldToIso(cols - 1, 0);
    const bottomLeft  = IsometricSystem.worldToIso(0, rows - 1);
    const bottomRight = IsometricSystem.worldToIso(cols - 1, rows - 1);

    const minX = Math.min(topLeft.x, topRight.x, bottomLeft.x, bottomRight.x) - IsometricSystem.TILE_HALF_W;
    const maxX = Math.max(topLeft.x, topRight.x, bottomLeft.x, bottomRight.x) + IsometricSystem.TILE_HALF_W;
    const minY = Math.min(topLeft.y, topRight.y, bottomLeft.y, bottomRight.y) - IsometricSystem.TILE_HALF_H;
    const maxY = Math.max(topLeft.y, topRight.y, bottomLeft.y, bottomRight.y) + IsometricSystem.TILE_HALF_H + 60;

    this.cameraSystem.setBounds(minX, minY, maxX - minX, maxY - minY);
    this.cameraSystem.follow(this.localAvatar);
  }

  // -----------------------------------------------------------------------
  // Back button
  // -----------------------------------------------------------------------

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
    btn.on('pointerout',  () => btn.setStyle({ color: '#ffffff' }));
    btn.on('pointerup',   () => this.scene.start('MenuScene'));
  }
}
