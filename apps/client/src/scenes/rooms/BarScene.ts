/**
 * BarScene — first multiplayer room.
 * 18×17 isometric grid with bar-themed layout.
 * Connects to the server via NetworkSystem and manages remote avatars.
 */

import { Direction } from '@social-square/shared';
import type { AvatarConfig, HeldItem } from '@social-square/shared';
import { useUserStore } from '../../store/userStore';
import { useGameStore } from '../../store/gameStore';
import { eventBus } from '../../eventBus';
import { NetworkSystem } from '../../systems/NetworkSystem';
import { VoiceSystem } from '../../systems/VoiceSystem';
import { RemoteAvatar } from '../../entities/RemoteAvatar';
import { InteractStation } from '../../entities/InteractStation';
import { BaseRoomScene, type RoomConfig, type TileData } from './BaseRoomScene';

// ─── Tile palette ────────────────────────────────────────────────────────────
const FLOOR_A = 0x3d2b1f;  // dark wood
const FLOOR_B = 0x4a3525;  // lighter wood
const OBSTACLE = 0x6b3a2a; // warm brown obstacle

// ─── Room layout helpers ─────────────────────────────────────────────────────
const COLS = 18;
const ROWS = 17;

/** Obstacle positions as [col, row] pairs */
const OBSTACLES: [number, number][] = [
  // Bar counter — top row
  [1, 0], [2, 0], [3, 0], [4, 0], [5, 0], [6, 0], [7, 0], [8, 0],
  // Shelf / wall decoration top-right
  [15, 0], [16, 0], [17, 0],
  // Jukebox
  [16, 3],
  // Tables (2×1)
  [4, 5], [5, 5],
  [12, 5], [13, 5],
  [4, 10], [5, 10],
  [12, 10], [13, 10],
];

function buildBarConfig(): RoomConfig {
  const tiles: TileData[][] = [];

  for (let row = 0; row < ROWS; row++) {
    tiles[row] = [];
    for (let col = 0; col < COLS; col++) {
      tiles[row][col] = {
        walkable: true,
        color: (col + row) % 2 === 0 ? FLOOR_A : FLOOR_B,
      };
    }
  }

  for (const [col, row] of OBSTACLES) {
    if (row >= 0 && row < ROWS && col >= 0 && col < COLS) {
      tiles[row][col] = { walkable: false, color: OBSTACLE };
    }
  }

  return {
    cols: COLS,
    rows: ROWS,
    tiles,
    spawnX: 9,
    spawnY: 14,
    username: useUserStore.getState().username ?? 'Player',
  };
}

// ─── Station icon drawing ──────────────────────────────────────────────────────
// All icons drawn centered on (0,0); base sits ~y=-8 to rest on the raised counter.

function drawBeerTap(g: Phaser.GameObjects.Graphics): void {
  // Metal base
  g.fillStyle(0x2b2b30, 1);
  g.fillRoundedRect(-7, -14, 14, 8, 2);
  // Column
  g.fillStyle(0xcfcfd8, 1);
  g.fillRect(-3, -30, 6, 18);
  g.lineStyle(1, 0x000000, 0.25);
  g.strokeRect(-3, -30, 6, 18);
  // Spout
  g.fillStyle(0xcfcfd8, 1);
  g.fillRect(-3, -30, 11, 4);
  g.fillRect(5, -30, 4, 8);
  // Handle knob
  g.fillStyle(0x111111, 1);
  g.fillRect(-1.5, -38, 3, 8);
  g.fillStyle(0xff4d4d, 1);
  g.fillCircle(0, -38, 3.5);
  g.fillStyle(0xffffff, 0.4);
  g.fillCircle(-1, -39, 1);
}

function drawPretzelStand(g: Phaser.GameObjects.Graphics): void {
  // Board / tray
  g.fillStyle(0x6b3a2a, 1);
  g.fillRoundedRect(-12, -12, 24, 7, 2);
  g.lineStyle(1, 0x000000, 0.3);
  g.strokeRoundedRect(-12, -12, 24, 7, 2);
  // Two pretzels stacked
  for (const [ox, oy] of [[-5, -16], [5, -18]] as [number, number][]) {
    g.lineStyle(3, 0x8a4b1e, 1);
    g.strokeCircle(ox - 2.5, oy, 3.5);
    g.strokeCircle(ox + 2.5, oy, 3.5);
    g.lineStyle(3, 0x9c5a28, 1);
    g.beginPath();
    g.arc(ox, oy + 2, 4.5, Phaser.Math.DegToRad(20), Phaser.Math.DegToRad(160), false);
    g.strokePath();
    g.fillStyle(0xffffff, 0.85);
    g.fillCircle(ox - 2, oy - 1, 0.7);
    g.fillCircle(ox + 2, oy, 0.7);
  }
}

// ─── Scene ───────────────────────────────────────────────────────────────────
export class BarScene extends BaseRoomScene {
  private _network!: NetworkSystem;
  private _voice!: VoiceSystem;
  private _remoteAvatars = new Map<string, RemoteAvatar>();
  private _myUserId: string | null = null;
  private _stations: InteractStation[] = [];
  private _sipsLeft = 0;

  private static readonly BEER_SIPS = 3;
  private static readonly PRETZEL_BITES = 2;

  constructor() {
    super('BarScene');
  }

  protected getRoomConfig(): RoomConfig {
    return buildBarConfig();
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  create(): void {
    super.create();
    this._setupNetwork();

    // After super.create() the onMove callback is set. Override it to also
    // broadcast position to the server.
    const originalOnMove = this.movementSystem.onMove;
    this.movementSystem.onMove = (x, y, moving) => {
      originalOnMove?.(x, y, moving);
      this._network.emitMove(x, y, Direction.SE, moving ? 'walk' : 'idle');
    };

    eventBus.on('exit-room', () => this.scene.start('MenuScene'), this);
    eventBus.on('voice-toggle', () => {
      const muted = this._voice.toggleMute();
      useGameStore.getState().setVoiceMuted(muted);
    }, this);
    eventBus.on('audio-input-change', (deviceId: string) => {
      void this._voice?.switchInputDevice(deviceId);
    }, this);

    this._createStations();

    // Drink / eat held item
    this.input.keyboard?.on('keydown-B', () => this._consume());

    this.events.on(Phaser.Scenes.Events.SHUTDOWN, this._onShutdown, this);
  }

  update(time: number, delta: number): void {
    super.update(time, delta);
    this._remoteAvatars.forEach((avatar) => avatar.tick());
  }

  // ── Interactive stations ────────────────────────────────────────────────────

  private _createStations(): void {
    this._stations.push(new InteractStation({
      scene: this, worldX: 2, worldY: 0,
      label: '🍺 Spillatore — click per una birra',
      draw: drawBeerTap,
      hitWidth: 26, hitHeight: 42,
      onInteract: () => this._pickUp('beer'),
    }));

    this._stations.push(new InteractStation({
      scene: this, worldX: 6, worldY: 0,
      label: '🥨 Pretzel — click per uno snack',
      draw: drawPretzelStand,
      hitWidth: 30, hitHeight: 30,
      onInteract: () => this._pickUp('pretzel'),
    }));
  }

  private _pickUp(item: HeldItem): void {
    if (!item) return;
    this._sipsLeft = item === 'beer' ? BarScene.BEER_SIPS : BarScene.PRETZEL_BITES;
    this.localAvatar.setHeldItem(item, 1);
    useGameStore.getState().setHeldItem(item);
    this._network.emitHoldItem(item);
  }

  private _consume(): void {
    const item = this.localAvatar?.heldItem;
    if (!item) return;

    this.localAvatar.consume();
    this._sipsLeft--;

    if (this._sipsLeft <= 0) {
      this.localAvatar.setHeldItem(null);
      useGameStore.getState().setHeldItem(null);
      this._network.emitHoldItem(null);
    } else if (item === 'beer') {
      this.localAvatar.setHeldItem('beer', this._sipsLeft / BarScene.BEER_SIPS);
    }
  }

  // ── Network setup ─────────────────────────────────────────────────────────

  private _setupNetwork(): void {
    const { username = 'Player', token } = useUserStore.getState();

    this._network = new NetworkSystem();
    this._network.setCallbacks({
      onConnect: (socketId) => {
        this._myUserId = socketId;
        // With JWT, userId comes from the token; without JWT, use socket id
        const store = useUserStore.getState();
        if (!store.userId) useUserStore.getState().setUser(socketId, username ?? 'Player');
        useGameStore.getState().setConnected(true);
        useGameStore.getState().setRoomName('Bar');
        useGameStore.getState().setCurrentRoom('bar');

        const avatarConfig: AvatarConfig = {
          userId: socketId,
          username: username ?? 'Player',
          body: 0, outfit: 0, hair: 0,
          hairColor: '#4488ff',
          accessory: 0, expression: 0,
        };
        this._network.joinRoom('bar', avatarConfig);

        // Start voice after socket connected (token already validated)
        void this._setupVoice();
      },

      onDisconnect: () => {
        useGameStore.getState().setConnected(false);
      },

      onRoomState: (roomState) => {
        // +1 for self (not yet in the list when room-state arrives)
        useGameStore.getState().setUsersInRoom(roomState.users.length + 1);
        roomState.users.forEach((user) => {
          if (user.userId === this._myUserId) return;
          this._spawnRemote(user.userId, user.avatarConfig.username, user.position.x, user.position.y, user.heldItem ?? null);
        });
      },

      onUserJoined: ({ userId, avatarConfig, position }) => {
        if (userId === this._myUserId) return;
        this._spawnRemote(userId, avatarConfig.username, position.x, position.y, null);
      },

      onUserLeft: ({ userId }) => {
        this._destroyRemote(userId);
      },

      onUserMoved: ({ userId, x, y, direction, state }) => {
        this._remoteAvatars.get(userId)?.updateTarget(x, y, direction, state);
      },

      onRoomUsersCount: ({ roomId, count }) => {
        if (roomId === 'bar') useGameStore.getState().setUsersInRoom(count);
      },

      onUserHeldItem: ({ userId, item }) => {
        if (userId === this._myUserId) return;
        this._remoteAvatars.get(userId)?.setHeldItem(item ?? null);
      },

      onError: ({ code, message }) => {
        console.error(`[Network] ${code}: ${message}`);
      },
    });

    this._network.connect(username ?? 'Player', token ?? undefined);
  }

  // ── Voice ─────────────────────────────────────────────────────────────────

  private async _setupVoice(): Promise<void> {
    const { token } = useUserStore.getState();
    if (!token) return;

    this._voice = new VoiceSystem();
    this._voice.setCallbacks({
      onConnected: () => useGameStore.getState().setVoiceAvailable(true),
      onDisconnected: () => useGameStore.getState().setVoiceAvailable(false),
      onSpeakingChanged: (userId, speaking) => this._onSpeakingChanged(userId, speaking),
    });

    await this._voice.connect(token, 'bar');
  }

  private _onSpeakingChanged(userId: string, speaking: boolean): void {
    if (userId === this._myUserId) {
      // Local avatar — find it via the scene's local avatar reference
      this.localAvatar?.setSpeaking(speaking);
      return;
    }
    this._remoteAvatars.get(userId)?.setSpeaking(speaking);
  }

  // ── Remote avatar management ──────────────────────────────────────────────

  private _spawnRemote(userId: string, username: string, worldX: number, worldY: number, heldItem: HeldItem = null): void {
    if (this._remoteAvatars.has(userId)) return;
    const avatar = new RemoteAvatar({ scene: this, username, worldX, worldY });
    if (heldItem) avatar.setHeldItem(heldItem);
    this._remoteAvatars.set(userId, avatar);
    this.isoSystem.register(avatar, worldX, worldY);
  }

  private _destroyRemote(userId: string): void {
    const avatar = this._remoteAvatars.get(userId);
    if (!avatar) return;
    this.isoSystem.unregister(avatar);
    avatar.destroy();
    this._remoteAvatars.delete(userId);
  }

  // ── Cleanup ───────────────────────────────────────────────────────────────

  private _onShutdown(): void {
    eventBus.off('exit-room');
    eventBus.off('voice-toggle');
    eventBus.off('audio-input-change');
    this.input.keyboard?.off('keydown-B');
    this._network.leaveRoom('bar');
    this._network.disconnect();
    void this._voice?.disconnect();
    this._remoteAvatars.forEach((a) => a.destroy());
    this._remoteAvatars.clear();
    this._stations.forEach((s) => s.destroy());
    this._stations = [];
    this.input.setDefaultCursor('default');
    useGameStore.getState().setConnected(false);
    useGameStore.getState().setCurrentRoom(null);
    useGameStore.getState().setRoomName(null);
    useGameStore.getState().setUsersInRoom(0);
    useGameStore.getState().setVoiceAvailable(false);
    useGameStore.getState().setVoiceMuted(false);
    useGameStore.getState().setHeldItem(null);
  }
}
