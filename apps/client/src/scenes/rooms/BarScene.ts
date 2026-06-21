/**
 * BarScene — first multiplayer room.
 * 18×17 isometric grid with bar-themed layout.
 * Connects to the server via NetworkSystem and manages remote avatars.
 */

import {
  Direction,
  jukeboxTitle,
  nextJukeboxTrackId,
  normalizeJukeboxState,
} from '@social-square/shared';
import type {
  AvatarConfig,
  AvatarState,
  EmoteId,
  HeldItem,
  JukeboxState,
  ObjectState,
} from '@social-square/shared';
import { JukeboxPlayer } from '../../audio/JukeboxPlayer';
import { useUserStore } from '../../store/userStore';
import { useGameStore } from '../../store/gameStore';
import { eventBus } from '../../eventBus';
import { NetworkSystem } from '../../systems/NetworkSystem';
import { VoiceSystem } from '../../systems/VoiceSystem';
import { RemoteAvatar } from '../../entities/RemoteAvatar';
import { InteractStation } from '../../entities/InteractStation';
import { JUKEBOX_OBJECT_ID, SEAT_DEFINITIONS, isSeatObjectId, type SeatDefinition } from '../../world/interactions';
import { BaseRoomScene, type WorldConfig } from './BaseRoomScene';

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
function drawHotspot(_g: Phaser.GameObjects.Graphics): void {
  _g.fillStyle(0xffffff, 0.001);
  _g.fillRect(-32, -56, 64, 56);
}

export class BarScene extends BaseRoomScene {
  private _network!: NetworkSystem;
  private _voice!: VoiceSystem;
  private _remoteAvatars = new Map<string, RemoteAvatar>();
  private _myUserId: string | null = null;
  private _stations: InteractStation[] = [];
  private _sipsLeft = 0;
  private _jukebox = new JukeboxPlayer();
  private _jukeboxState: JukeboxState = normalizeJukeboxState(null);
  private _seatOccupants = new Map<string, string>();
  private _pendingSeat: SeatDefinition | null = null;
  private _seatedSeatId: string | null = null;
  private _noticeText: Phaser.GameObjects.Text | null = null;

  private static readonly BEER_SIPS = 3;
  private static readonly PRETZEL_BITES = 2;

  constructor() {
    super('BarScene');
  }

  protected getWorldConfig(): WorldConfig {
    return {
      spawnX: 9,
      spawnY: 14,
      username: useUserStore.getState().username ?? 'Player',
    };
  }

  protected override onLocalMove(x: number, y: number, moving: boolean): void {
    this._network?.emitMove(x, y, Direction.SE, moving ? 'walk' : 'idle');
  }

  protected override onLocalMoveCommand(_targetX: number, _targetY: number): void {
    this._pendingSeat = null;
    this._leaveSeat(true);
  }

  protected override onTileInteract(tileX: number, tileY: number): boolean {
    const seat = SEAT_DEFINITIONS.find((candidate) => candidate.x === tileX && candidate.y === tileY);
    if (seat) {
      this._beginSeatInteraction(seat);
      return true;
    }

    if (tileX === 16 && tileY === 3) {
      this._requestJukeboxNext();
      return true;
    }

    return false;
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  create(): void {
    super.create();
    this._setupNetwork();

    eventBus.on('exit-room', () => this.scene.start('MenuScene'), this);
    eventBus.on('voice-toggle', () => {
      const muted = this._voice.toggleMute();
      useGameStore.getState().setVoiceMuted(muted);
    }, this);
    eventBus.on('audio-input-change', (deviceId: string) => {
      void this._voice?.switchInputDevice(deviceId);
    }, this);
    eventBus.on('emote', (emoteId: EmoteId) => this._triggerEmote(emoteId), this);
    eventBus.on('leave-seat', () => this._leaveSeat(true), this);
    eventBus.on('jukebox-toggle', () => this._requestJukeboxToggle(), this);
    eventBus.on('jukebox-next', () => this._requestJukeboxNext(), this);

    this._createStations();

    // Drink / eat held item
    this.input.keyboard?.on('keydown-B', () => this._consume());
    this.input.keyboard?.on('keydown-ONE', () => this._triggerEmote('wave'));
    this.input.keyboard?.on('keydown-TWO', () => this._triggerEmote('dance'));
    this.input.keyboard?.on('keydown-THREE', () => this._triggerEmote('clap'));
    this.input.keyboard?.on('keydown-J', () => this._requestJukeboxToggle());

    this.events.on(Phaser.Scenes.Events.SHUTDOWN, this._onShutdown, this);
  }

  update(time: number, delta: number): void {
    super.update(time, delta);
    this._remoteAvatars.forEach((avatar) => avatar.tick());
    this._updatePendingSeat();
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

    this._stations.push(new InteractStation({
      scene: this, worldX: 16, worldY: 3,
      label: 'Jukebox - click per cambiare brano',
      draw: drawHotspot,
      hitWidth: 54, hitHeight: 62,
      onInteract: () => this._requestJukeboxNext(),
    }));

    for (const seat of SEAT_DEFINITIONS) {
      this._stations.push(new InteractStation({
        scene: this, worldX: seat.x, worldY: seat.y,
        label: `${seat.label} - click per sederti`,
        draw: drawHotspot,
        hitWidth: seat.kind === 'bench' ? 72 : 58,
        hitHeight: seat.kind === 'bench' ? 48 : 52,
        onInteract: () => this._beginSeatInteraction(seat),
      }));
    }
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

  private _beginSeatInteraction(seat: SeatDefinition): void {
    const occupant = this._seatOccupants.get(seat.id);
    if (occupant && occupant !== this._myUserId) {
      this._showNotice('Seduta occupata');
      return;
    }

    if (this._seatedSeatId === seat.id) {
      this._leaveSeat(true);
      return;
    }

    this._leaveSeat(true);
    this._pendingSeat = seat;

    if (!this.worldMap.isWalkable(seat.x, seat.y)) {
      this._pendingSeat = null;
      this._showNotice('Non riesco a raggiungere la seduta');
      return;
    }

    const started = this.movementSystem.moveTo(seat.x, seat.y);
    this.setLocalAvatarState(null);
    if (!started) this._requestSit(seat);
  }

  private _updatePendingSeat(): void {
    if (!this._pendingSeat || this.movementSystem.isMoving) return;
    const seat = this._pendingSeat;
    const dx = this.movementSystem.posX - seat.x;
    const dy = this.movementSystem.posY - seat.y;
    if (Math.sqrt(dx * dx + dy * dy) > 0.08) return;

    this._pendingSeat = null;
    this._requestSit(seat);
  }

  private _requestSit(seat: SeatDefinition): void {
    this._network?.emitInteract(seat.id, 'seat-sit', { x: seat.x, y: seat.y });
    this._applySeatState(seat.id, { kind: 'seat', occupiedBy: this._myUserId, x: seat.x, y: seat.y });
  }

  private _leaveSeat(emit: boolean): void {
    if (!this._seatedSeatId) return;
    const seatId = this._seatedSeatId;
    this._seatedSeatId = null;
    this.setLocalAvatarState(null);

    if (emit) {
      this._network?.emitInteract(seatId, 'seat-leave', {
        x: Math.round(this.movementSystem.posX),
        y: Math.round(this.movementSystem.posY),
      });
    }
  }

  private _triggerEmote(emoteId: EmoteId): void {
    this.localAvatar?.playEmote(emoteId);
    this._network?.emitEmote(emoteId);
  }

  private _requestJukeboxToggle(): void {
    const now = Date.now();
    const next: JukeboxState = {
      ...this._jukeboxState,
      playing: !this._jukeboxState.playing,
      startedAt: this._jukeboxState.playing ? null : now,
      updatedAt: now,
      requestedBy: useUserStore.getState().username ?? undefined,
    };
    void this._applyJukeboxState(next);
    this._network?.emitInteract(JUKEBOX_OBJECT_ID, 'jukebox-toggle');
  }

  private _requestJukeboxNext(): void {
    const now = Date.now();
    const next: JukeboxState = {
      ...this._jukeboxState,
      trackId: nextJukeboxTrackId(this._jukeboxState.trackId),
      playing: true,
      startedAt: now,
      updatedAt: now,
      requestedBy: useUserStore.getState().username ?? undefined,
    };
    void this._applyJukeboxState(next);
    this._network?.emitInteract(JUKEBOX_OBJECT_ID, 'jukebox-next');
  }

  private async _applyJukeboxState(rawState: unknown): Promise<void> {
    const state = normalizeJukeboxState(rawState);
    this._jukeboxState = state;
    const result = await this._jukebox.applyState(state);
    useGameStore.getState().setJukeboxStatus({
      trackId: state.trackId,
      title: jukeboxTitle(state.trackId),
      playing: state.playing,
      blocked: result.blocked,
    });
    if (result.blocked) this._showNotice('Clicca Play sul jukebox per abilitare audio');
  }

  private _applyObjectState(objectId: string, objectState: ObjectState): void {
    if (objectId === JUKEBOX_OBJECT_ID) {
      void this._applyJukeboxState(objectState);
      return;
    }
    if (isSeatObjectId(objectId)) this._applySeatState(objectId, objectState);
  }

  private _applySeatState(objectId: string, objectState: ObjectState): void {
    const occupiedBy = typeof objectState.occupiedBy === 'string' ? objectState.occupiedBy : null;
    const x = typeof objectState.x === 'number' ? objectState.x : null;
    const y = typeof objectState.y === 'number' ? objectState.y : null;

    if (occupiedBy) {
      this._seatOccupants.set(objectId, occupiedBy);
    } else {
      this._seatOccupants.delete(objectId);
    }

    if (occupiedBy === this._myUserId && x !== null && y !== null) {
      this._seatedSeatId = objectId;
      this._pendingSeat = null;
      this.setLocalAvatarTile(x, y, 'sit');
      return;
    }

    if (this._seatedSeatId === objectId && occupiedBy !== this._myUserId) {
      this._seatedSeatId = null;
      this.setLocalAvatarState(null);
    }
  }

  private _showNotice(message: string): void {
    if (!this._noticeText) {
      this._noticeText = this.add.text(this.scale.width / 2, 62, message, {
        fontSize: '12px',
        color: '#fff4d0',
        fontFamily: 'monospace',
        backgroundColor: '#1a1206dd',
        padding: { x: 10, y: 5 },
      }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(1001);
    }

    this._noticeText.setText(message).setAlpha(1).setVisible(true);
    this._noticeText.setX(this.scale.width / 2);
    this.tweens.add({
      targets: this._noticeText,
      alpha: 0,
      delay: 1400,
      duration: 450,
      ease: 'Quad.easeOut',
      onComplete: () => this._noticeText?.setVisible(false),
    });
  }

  private _setupNetwork(): void {
    const { username = 'Player', token } = useUserStore.getState();

    this._network = new NetworkSystem();
    this._network.setCallbacks({
      onConnect: (socketId) => {
        // With JWT, userId comes from the token; without JWT, use socket id
        const store = useUserStore.getState();
        this._myUserId = store.userId ?? socketId;
        if (!store.userId) useUserStore.getState().setUser(socketId, username ?? 'Player');
        useGameStore.getState().setConnected(true);
        useGameStore.getState().setRoomName('Bar');
        useGameStore.getState().setCurrentRoom('bar');

        const avatarConfig: AvatarConfig = {
          userId: this._myUserId,
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
        useGameStore.getState().setUsersInRoom(roomState.users.length);
        roomState.objects.forEach((object) => this._applyObjectState(object.objectId, object.state));
        roomState.users.forEach((user) => {
          if (user.userId === this._myUserId) return;
          this._spawnRemote(
            user.userId,
            user.avatarConfig.username,
            user.position.x,
            user.position.y,
            user.heldItem ?? null,
            user.state,
          );
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
        if (userId === this._myUserId) {
          if (state === 'sit') this.setLocalAvatarTile(x, y, 'sit');
          else if (state === 'idle' && this._seatedSeatId) this.setLocalAvatarState(null);
          return;
        }
        this._remoteAvatars.get(userId)?.updateTarget(x, y, direction, state);
      },

      onRoomUsersCount: ({ roomId, count }) => {
        if (roomId === 'bar') useGameStore.getState().setUsersInRoom(count);
      },

      onUserHeldItem: ({ userId, item }) => {
        if (userId === this._myUserId) return;
        this._remoteAvatars.get(userId)?.setHeldItem(item ?? null);
      },

      onObjectStateChanged: ({ objectId, state }) => {
        this._applyObjectState(objectId, state);
      },

      onUserEmote: ({ userId, emoteId }) => {
        if (userId === this._myUserId) return;
        this._remoteAvatars.get(userId)?.playEmote(emoteId);
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

  private _spawnRemote(
    userId: string,
    username: string,
    worldX: number,
    worldY: number,
    heldItem: HeldItem = null,
    state: AvatarState = 'idle',
  ): void {
    if (this._remoteAvatars.has(userId)) return;
    const avatar = new RemoteAvatar({ scene: this, username, worldX, worldY });
    if (heldItem) avatar.setHeldItem(heldItem);
    avatar.playAnimation(state);
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
    eventBus.off('emote');
    eventBus.off('leave-seat');
    eventBus.off('jukebox-toggle');
    eventBus.off('jukebox-next');
    this.input.keyboard?.off('keydown-B');
    this.input.keyboard?.off('keydown-ONE');
    this.input.keyboard?.off('keydown-TWO');
    this.input.keyboard?.off('keydown-THREE');
    this.input.keyboard?.off('keydown-J');
    this._jukebox.destroy();
    this._network.leaveRoom('bar');
    this._network.disconnect();
    void this._voice?.disconnect();
    this._remoteAvatars.forEach((a) => a.destroy());
    this._remoteAvatars.clear();
    this._stations.forEach((s) => s.destroy());
    this._stations = [];
    this._seatOccupants.clear();
    this._pendingSeat = null;
    this._seatedSeatId = null;
    this._noticeText?.destroy();
    this._noticeText = null;
    this.destroyWorld();
    this.input.setDefaultCursor('default');
    useGameStore.getState().setConnected(false);
    useGameStore.getState().setCurrentRoom(null);
    useGameStore.getState().setRoomName(null);
    useGameStore.getState().setUsersInRoom(0);
    useGameStore.getState().setVoiceAvailable(false);
    useGameStore.getState().setVoiceMuted(false);
    useGameStore.getState().setHeldItem(null);
    useGameStore.getState().setJukeboxStatus(null);
    useGameStore.getState().setLocalAvatarState('idle');
  }
}
