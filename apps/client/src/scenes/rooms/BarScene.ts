/**
 * BarScene — first multiplayer room.
 * 18×17 isometric grid with bar-themed layout.
 * Connects to the server via NetworkSystem and manages remote avatars.
 */

import {
  Direction,
  JUKEBOX_PLAY_COST,
  WAITER_OBJECT_ID,
  jukeboxTitle,
  normalizeJukeboxState,
  normalizeWaiterState,
  parseJukeboxExternalTrack,
} from '@social-square/shared';
import type {
  AvatarConfig,
  AvatarState,
  ChatMessage,
  EmoteId,
  HeldItem,
  JukeboxState,
  ObjectState,
  OrderItemId,
  Position,
  WaiterState,
} from '@social-square/shared';
import { JukeboxPlayer } from '../../audio/JukeboxPlayer';
import { adjustAccountPetals } from '../../api/account';
import { useUserStore } from '../../store/userStore';
import { useGameStore } from '../../store/gameStore';
import { eventBus } from '../../eventBus';
import { NetworkSystem } from '../../systems/NetworkSystem';
import { VoiceSystem } from '../../systems/VoiceSystem';
import { IsometricSystem } from '../../systems/IsometricSystem';
import { RemoteAvatar } from '../../entities/RemoteAvatar';
import { InteractStation } from '../../entities/InteractStation';
import {
  INTERACTION_RADIUS_TILES,
  JUKEBOX_OBJECT_ID,
  JUKEBOX_POSITION,
  PETAL_ACTION_COST,
  PETAL_BLOOM_VALUE,
  SEAT_DEFINITIONS,
  isSeatObjectId,
  isWithinInteractionRange,
  type SeatDefinition,
} from '../../world/interactions';
import {
  exitsForLocation,
  locationForId,
  locationForPosition,
  locationIdForPosition,
  targetName,
  type LocationExit,
  type LocationId,
} from '../../world/locations';
import { BaseRoomScene, type WorldConfig } from './BaseRoomScene';

// ─── Station icon drawing ──────────────────────────────────────────────────────
// All icons drawn centered on (0,0); base sits ~y=-26 to rest on the counter top
// (the counter surface is at roughly y=-26; lower values would land on the front face).

function drawBeerTap(g: Phaser.GameObjects.Graphics): void {
  // Metal base
  g.fillStyle(0x2b2b30, 1);
  g.fillRoundedRect(-7, -32, 14, 8, 2);
  // Column
  g.fillStyle(0xcfcfd8, 1);
  g.fillRect(-3, -48, 6, 18);
  g.lineStyle(1, 0x000000, 0.25);
  g.strokeRect(-3, -48, 6, 18);
  // Spout
  g.fillStyle(0xcfcfd8, 1);
  g.fillRect(-3, -48, 11, 4);
  g.fillRect(5, -48, 4, 8);
  // Handle knob
  g.fillStyle(0x111111, 1);
  g.fillRect(-1.5, -56, 3, 8);
  g.fillStyle(0xff4d4d, 1);
  g.fillCircle(0, -56, 3.5);
  g.fillStyle(0xffffff, 0.4);
  g.fillCircle(-1, -57, 1);
}

function drawPretzelStand(g: Phaser.GameObjects.Graphics): void {
  // Board / tray
  g.fillStyle(0x6b3a2a, 1);
  g.fillRoundedRect(-12, -30, 24, 7, 2);
  g.lineStyle(1, 0x000000, 0.3);
  g.strokeRoundedRect(-12, -30, 24, 7, 2);
  // Two pretzels stacked
  for (const [ox, oy] of [[-5, -34], [5, -36]] as [number, number][]) {
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
function drawPetalBloom(g: Phaser.GameObjects.Graphics): void {
  g.fillStyle(0x000000, 0.18);
  g.fillEllipse(0, 3, 28, 10);
  g.lineStyle(2, 0x2e7d36, 1);
  g.lineBetween(0, 0, 0, -22);
  g.lineBetween(0, -9, -9, -15);
  g.lineBetween(0, -10, 9, -16);

  const colors = [0xffd166, 0xe85d75, 0x9b7cff, 0xffffff];
  for (let i = 0; i < 8; i++) {
    const angle = (Math.PI * 2 * i) / 8;
    const x = Math.cos(angle) * 9;
    const y = -24 + Math.sin(angle) * 5;
    g.fillStyle(colors[i % colors.length], 1);
    g.fillEllipse(x, y, 6, 4);
  }
  g.fillStyle(0xfff4d0, 1);
  g.fillCircle(0, -24, 3);

  for (const [x, y, color] of [
    [-13, -2, 0xffd166],
    [-5, 5, 0xe85d75],
    [8, 1, 0x9b7cff],
    [15, 5, 0xffffff],
  ] as Array<[number, number, number]>) {
    g.fillStyle(color, 0.95);
    g.fillEllipse(x, y, 5, 3);
  }
}

function drawHotspot(_g: Phaser.GameObjects.Graphics): void {
  _g.fillStyle(0xffffff, 0.001);
  _g.fillRect(-32, -56, 64, 56);
}

function drawExitMarker(g: Phaser.GameObjects.Graphics): void {
  g.fillStyle(0x000000, 0.2);
  g.fillEllipse(0, 3, 58, 18);
  g.fillStyle(0x44ff88, 0.28);
  g.fillEllipse(0, -2, 48, 15);
  g.lineStyle(2, 0x44ff88, 0.9);
  g.strokeEllipse(0, -2, 50, 17);
  g.fillStyle(0x44ff88, 0.95);
  g.fillTriangle(-10, -12, 10, -2, -10, 8);
  g.fillRect(-16, -5, 18, 6);
  g.fillStyle(0xffffff, 0.65);
  g.fillCircle(12, -8, 2);
  g.fillCircle(18, -2, 2);
  g.fillCircle(12, 4, 2);
}

interface PetalBloom {
  station: InteractStation;
  position: Position;
}

const PETAL_MAX_ACTIVE = 5;
const PETAL_SPAWN_INTERVAL_MS = 9000;
const PETAL_COLLECT_RADIUS_TILES = 2.75;
const PETAL_AUTO_COLLECT_RADIUS_TILES = 1.05;
const PETAL_SPAWN_POINTS: Position[] = [
  { x: 3, y: 35 },
  { x: 12, y: 30 },
  { x: 20, y: 42 },
  { x: 11, y: 43 },
  { x: 28, y: 33 },
  { x: 35, y: 42 },
  { x: 41, y: 30 },
  { x: 44, y: 14 },
];

export class BarScene extends BaseRoomScene {
  private _network!: NetworkSystem;
  private _voice: VoiceSystem | null = null;
  private _remoteAvatars = new Map<string, RemoteAvatar>();
  private _myUserId: string | null = null;
  private _stations: InteractStation[] = [];
  private _exitStations: InteractStation[] = [];
  private _petalBlooms: PetalBloom[] = [];
  private _petalSpawnTimer: Phaser.Time.TimerEvent | null = null;
  private _sipsLeft = 0;
  private _jukebox = new JukeboxPlayer();
  private _jukeboxState: JukeboxState = normalizeJukeboxState(null);
  private _seatOccupants = new Map<string, string>();
  private _pendingSeat: SeatDefinition | null = null;
  private _seatedSeatId: string | null = null;
  private _noticeText: Phaser.GameObjects.Text | null = null;
  private _waiterAvatar: RemoteAvatar | null = null;
  private _waiterState: WaiterState = normalizeWaiterState(null);
  private _deliveredOrderIds = new Set<string>();
  private _lastLocalContextKey = '';
  private _pendingExit: LocationExit | null = null;
  private _lastTravelAt = 0;
  private _voiceConnectSeq = 0;
  private _voiceSpatialElapsed = 0;
  private _localContextElapsed = 0;
  private _petalCollectElapsed = 0;
  private _mutedVoiceUsers = new Set<string>();

  private static readonly BEER_SIPS = 3;
  private static readonly PRETZEL_BITES = 2;
  // Counter fixtures must render above every counter piece (max depth ≈ 8 at x=8,y=0)
  // yet below the far bottle shelves; a fixed depth clears the whole counter row.
  private static readonly COUNTER_FIXTURE_DEPTH = 8.6;

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
    const currentLocationId = this._currentLocationId();
    const seat = SEAT_DEFINITIONS.find((candidate) => (
      locationIdForPosition(candidate) === currentLocationId &&
      candidate.x === tileX &&
      candidate.y === tileY
    ));
    if (seat) {
      this._beginSeatInteraction(seat);
      return true;
    }

    if (currentLocationId === '0,0' && tileX === JUKEBOX_POSITION.x && tileY === JUKEBOX_POSITION.y) {
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
      const muted = this._voice?.toggleMute() ?? useGameStore.getState().voiceMuted;
      useGameStore.getState().setVoiceMuted(muted);
    }, this);
    eventBus.on('audio-input-change', (deviceId: string) => {
      void this._voice?.switchInputDevice(deviceId);
    }, this);
    eventBus.on('emote', (emoteId: EmoteId) => this._triggerEmote(emoteId), this);
    eventBus.on('leave-seat', () => this._leaveSeat(true), this);
    eventBus.on('consume-held-item', () => this._consume(), this);
    eventBus.on('jukebox-toggle', () => this._requestJukeboxToggle(), this);
    eventBus.on('jukebox-next', () => this._requestJukeboxNext(), this);
    eventBus.on('chat-send', (text: string) => this._sendChatMessage(text), this);
    eventBus.on('waiter-call', () => this._callWaiter(), this);
    eventBus.on('waiter-order', (item: OrderItemId) => this._placeWaiterOrder(item), this);
    eventBus.on('fast-travel', (locationId: LocationId) => this._fastTravel(locationId), this);
    eventBus.on('voice-user-mute', (userId: string, muted: boolean) => this._setRemoteVoiceMuted(userId, muted), this);
    eventBus.on('jukebox-play-url', (url: string) => this._requestJukeboxPlayUrl(url), this);
    useGameStore.getState().clearChatMessages();

    this._rebuildLocationStations();
    this._rebuildExitStations();
    this._startPetalSpawns();

    // Spawn the waiter at its idle pose up front so it's always visible. The server
    // only broadcasts the waiter (interest-scoped) once a customer summons it, so
    // without this the bar would look unstaffed until an order is placed.
    this._applyWaiterState(null);

    // Drink / eat held item
    this.input.keyboard?.on('keydown-B', () => this._consume());
    this.input.keyboard?.on('keydown-ONE', () => this._triggerEmote('wave'));
    this.input.keyboard?.on('keydown-TWO', () => this._triggerEmote('dance'));
    this.input.keyboard?.on('keydown-THREE', () => this._triggerEmote('clap'));
    this.input.keyboard?.on('keydown-J', () => this._requestJukeboxToggle());
    this.input.keyboard?.on('keydown-M', () => {
      const store = useGameStore.getState();
      store.setShowWorldMap(!store.showWorldMap);
    });
    this.input.on(Phaser.Input.Events.POINTER_DOWN, this._primePetalAudio, this);

    this.events.on(Phaser.Scenes.Events.SHUTDOWN, this._onShutdown, this);
  }

  update(time: number, delta: number): void {
    super.update(time, delta);
    this._remoteAvatars.forEach((avatar) => avatar.tick());
    this._waiterAvatar?.tick();
    this._updatePendingSeat();
    this._updatePendingExit();
    this._checkExitTileTravel();
    this._localContextElapsed += delta;
    if (this._localContextElapsed >= 160) {
      this._localContextElapsed = 0;
      this._syncLocalContext();
    }
    this._syncVoiceSpatial(delta);
    this._syncJukeboxExpiry();
    this._petalCollectElapsed += delta;
    if (this._petalCollectElapsed >= 80) {
      this._petalCollectElapsed = 0;
      this._collectNearbyPetals();
    }
  }

  protected override collectDebugExtras(): Record<string, string | number | boolean | null> {
    return {
      remotes: this._remoteAvatars.size,
      petalBlooms: this._petalBlooms.length,
      exitStations: this._exitStations.length,
      interactStations: this._stations.length,
      voiceReady: this._voice?.isReady ?? false,
      jukeboxPlaying: this._jukeboxState.playing,
    };
  }

  // ── Interactive stations ────────────────────────────────────────────────────

  private _rebuildLocationStations(): void {
    this._destroyLocationStations();
    const locationId = this._currentLocationId();

    if (locationId === '0,0') {
      this._stations.push(new InteractStation({
        scene: this, worldX: 2, worldY: 0,
        label: `Spillatore - ${PETAL_ACTION_COST} petali`,
        draw: drawBeerTap,
        hitWidth: 26, hitHeight: 60,
        depth: BarScene.COUNTER_FIXTURE_DEPTH,
        ambientGlow: true,
        onInteract: () => this._pickUpFromStation('beer', { x: 2, y: 0 }),
      }));

      this._stations.push(new InteractStation({
        scene: this, worldX: 6, worldY: 0,
        label: `Pretzel - ${PETAL_ACTION_COST} petali`,
        draw: drawPretzelStand,
        hitWidth: 30, hitHeight: 44,
        depth: BarScene.COUNTER_FIXTURE_DEPTH,
        ambientGlow: true,
        onInteract: () => this._pickUpFromStation('pretzel', { x: 6, y: 0 }),
      }));

      this._stations.push(new InteractStation({
        scene: this, worldX: JUKEBOX_POSITION.x, worldY: JUKEBOX_POSITION.y,
        label: 'Jukebox - click per cambiare brano',
        draw: drawHotspot,
        hitWidth: 54, hitHeight: 62,
        onInteract: () => this._requestJukeboxNext(),
      }));
    }

    for (const seat of SEAT_DEFINITIONS) {
      if (locationIdForPosition(seat) !== locationId) continue;
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

  private _destroyLocationStations(): void {
    this._stations.forEach((station) => station.destroy());
    this._stations = [];
  }

  private _pickUpFromStation(item: HeldItem, position: Position): void {
    if (!this._isNear(position)) {
      this._showNotice('Avvicinati al bancone');
      return;
    }

    this._pickUp(item, true);
  }

  private _pickUp(item: HeldItem, chargePetals = false): void {
    if (!item) return;
    if (chargePetals && !this._trySpendPetals()) return;

    this._sipsLeft = item === 'beer' ? BarScene.BEER_SIPS : BarScene.PRETZEL_BITES;
    this.localAvatar.setHeldItem(item, 1);
    useGameStore.getState().setHeldItem(item);
    this._network.emitHoldItem(item);

    if (chargePetals) {
      const label = item === 'beer' ? 'Birra' : 'Pretzel';
      this._showNotice(`${label}: -${PETAL_ACTION_COST} petali`);
    }
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

  private _localPosition(): Position | null {
    if (!this.localAvatar) return null;
    return { x: this.movementSystem.posX, y: this.movementSystem.posY };
  }

  private _waiterPosition(): Position {
    return { x: this._waiterState.x, y: this._waiterState.y };
  }

  private _isNear(position: Position, radius = INTERACTION_RADIUS_TILES): boolean {
    const local = this._localPosition();
    return local ? isWithinInteractionRange(local, position, radius) : false;
  }

  private _syncLocalContext(): void {
    const local = this._localPosition();
    if (!local) return;

    const locationInfo = locationForPosition(local);
    const location = locationInfo.name;
    const inBarInterior = locationInfo.id === '0,0';
    const nearJukebox = inBarInterior && this._isNear(JUKEBOX_POSITION);
    const nearWaiter = inBarInterior && this._isNear(this._waiterPosition());
    const store = useGameStore.getState();
    const canAffordAction = store.petals >= PETAL_ACTION_COST;
    const nearbyExit = this._nearestExit(local);
    const routeHint = nearbyExit ? `Verso ${targetName(nearbyExit)}` : null;
    const key = `${location}|${nearJukebox ? 1 : 0}|${nearWaiter ? 1 : 0}|${canAffordAction ? 1 : 0}|${routeHint ?? ''}`;
    if (key === this._lastLocalContextKey) return;

    this._lastLocalContextKey = key;
    store.setLocationName(location);
    store.setRouteHint(routeHint);
    store.setActionAvailability({ nearJukebox, nearWaiter, canAffordAction });
  }

  private _trySpendPetals(cost = PETAL_ACTION_COST): boolean {
    const store = useGameStore.getState();
    if (store.petals < cost) {
      this._showNotice(`Servono ${cost} petali`);
      return false;
    }

    if (!store.spendPetals(cost)) {
      this._showNotice(`Servono ${cost} petali`);
      return false;
    }

    this._persistPetalDelta(-cost);
    this._syncLocalContext();
    return true;
  }

  private _persistPetalDelta(delta: number): void {
    const token = useUserStore.getState().token;
    void adjustAccountPetals(token, delta).then((petals) => {
      if (petals !== null) useGameStore.getState().setPetals(petals);
    });
  }

  private _startPetalSpawns(): void {
    this.time.delayedCall(1200, () => {
      for (let i = 0; i < 4; i++) this._spawnPetalBloom();
    });

    this._petalSpawnTimer = this.time.addEvent({
      delay: PETAL_SPAWN_INTERVAL_MS,
      loop: true,
      callback: () => this._spawnPetalBloom(),
    });
  }

  private _spawnPetalBloom(): void {
    if (this._petalBlooms.length >= PETAL_MAX_ACTIVE) return;

    const available = PETAL_SPAWN_POINTS.filter((point) => {
      const occupied = this._petalBlooms.some((bloom) => (
        Math.round(bloom.position.x) === Math.round(point.x) &&
        Math.round(bloom.position.y) === Math.round(point.y)
      ));
      if (occupied) return false;
      const tile = this.worldMap.getTile(Math.round(point.x), Math.round(point.y));
      return tile?.walkable === true;
    });
    if (available.length === 0) return;

    const index = Phaser.Math.Between(0, available.length - 1);
    const position = { ...available[index] };
    let bloom: PetalBloom;
    const station = new InteractStation({
      scene: this,
      worldX: position.x,
      worldY: position.y,
      label: `Petali +${PETAL_BLOOM_VALUE}`,
      draw: drawPetalBloom,
      hitWidth: 38,
      hitHeight: 42,
      ambientGlow: true,
      onInteract: () => this._collectPetalBloom(bloom),
    });

    bloom = { station, position };
    this._petalBlooms.push(bloom);
  }

  private _collectNearbyPetals(): void {
    const local = this._localPosition();
    if (!local || this._petalBlooms.length === 0) return;

    for (const bloom of [...this._petalBlooms]) {
      if (isWithinInteractionRange(local, bloom.position, PETAL_AUTO_COLLECT_RADIUS_TILES)) {
        this._collectPetalBloom(bloom, true);
      }
    }
  }

  private _collectPetalBloom(bloom: PetalBloom, automatic = false): void {
    if (!automatic && !this._isNear(bloom.position, PETAL_COLLECT_RADIUS_TILES)) {
      this._showNotice('Avvicinati ai petali');
      return;
    }

    this._petalBlooms = this._petalBlooms.filter((candidate) => candidate !== bloom);
    this._spawnPetalCollectBurst(bloom.position);
    this._playPetalCollectSound();
    bloom.station.destroy();
    useGameStore.getState().addPetals(PETAL_BLOOM_VALUE);
    this._persistPetalDelta(PETAL_BLOOM_VALUE);
    this._showNotice(`+${PETAL_BLOOM_VALUE} petali`);
    this._syncLocalContext();
  }

  private _spawnPetalCollectBurst(position: Position): void {
    const iso = IsometricSystem.worldToIso(position.x, position.y);
    const colors = [0xffd166, 0xe85d75, 0x9b7cff, 0xffffff, 0x88ffbb];

    for (let i = 0; i < 10; i++) {
      const petal = this.add.graphics({ x: iso.x, y: iso.y - 22 });
      petal.fillStyle(colors[i % colors.length], 1);
      petal.fillEllipse(0, 0, 8, 4);
      petal.setDepth(IsometricSystem.depth(position.x, position.y) + 8);
      petal.setRotation((Math.PI * 2 * i) / 10);

      const angle = (Math.PI * 2 * i) / 10;
      const distance = 24 + (i % 3) * 8;
      this.tweens.add({
        targets: petal,
        x: iso.x + Math.cos(angle) * distance,
        y: iso.y - 52 + Math.sin(angle) * 12,
        alpha: 0,
        scale: 0.45,
        duration: 520,
        ease: 'Cubic.easeOut',
        onComplete: () => petal.destroy(),
      });
    }

    const text = this.add.text(iso.x, iso.y - 46, `+${PETAL_BLOOM_VALUE}`, {
      fontSize: '18px',
      color: '#fff4d0',
      fontFamily: 'monospace',
      fontStyle: 'bold',
      stroke: '#1a1206',
      strokeThickness: 4,
    }).setOrigin(0.5).setDepth(IsometricSystem.depth(position.x, position.y) + 9);

    this.tweens.add({
      targets: text,
      y: iso.y - 86,
      alpha: 0,
      scale: 1.18,
      duration: 720,
      ease: 'Quad.easeOut',
      onComplete: () => text.destroy(),
    });
  }

  private _playPetalCollectSound(): void {
    const context = this._getPetalAudioContext();
    if (!context) return;

    void context.resume();

    const now = context.currentTime;
    const master = context.createGain();
    master.gain.setValueAtTime(0.0001, now);
    master.gain.exponentialRampToValueAtTime(0.16, now + 0.018);
    master.gain.exponentialRampToValueAtTime(0.0001, now + 0.34);
    master.connect(context.destination);

    for (const [index, frequency] of [660, 920, 1180].entries()) {
      const oscillator = context.createOscillator();
      oscillator.type = index === 0 ? 'triangle' : 'sine';
      oscillator.frequency.setValueAtTime(frequency, now + index * 0.045);
      oscillator.frequency.exponentialRampToValueAtTime(frequency * 1.18, now + 0.2 + index * 0.03);
      oscillator.connect(master);
      oscillator.start(now + index * 0.045);
      oscillator.stop(now + 0.36 + index * 0.035);
    }

    navigator.vibrate?.(18);
  }

  private _primePetalAudio(): void {
    const context = this._getPetalAudioContext();
    if (context) void context.resume();
  }

  private _getPetalAudioContext(): AudioContext | null {
    const win = window as Window & {
      webkitAudioContext?: typeof AudioContext;
      __socialSquarePetalAudioContext?: AudioContext;
    };
    const AudioContextCtor = window.AudioContext ?? win.webkitAudioContext;
    if (!AudioContextCtor) return null;

    const context = win.__socialSquarePetalAudioContext ?? new AudioContextCtor();
    win.__socialSquarePetalAudioContext = context;
    return context;
  }

  private _currentLocationId(): LocationId | string {
    const local = this._localPosition();
    return local ? locationIdForPosition(local) : '0,0';
  }

  private _rebuildExitStations(): void {
    this._exitStations.forEach((station) => station.destroy());
    this._exitStations = [];

    for (const exit of exitsForLocation(this._currentLocationId())) {
      this._exitStations.push(new InteractStation({
        scene: this,
        worldX: exit.trigger.x,
        worldY: exit.trigger.y,
        label: `Verso ${targetName(exit)}`,
        draw: drawExitMarker,
        hitWidth: 62,
        hitHeight: 38,
        ambientGlow: true,
        onInteract: () => this._beginExitTravel(exit),
      }));
    }
  }

  private _nearestExit(position: Position, radius = 4.25): LocationExit | null {
    let best: { exit: LocationExit; distance: number } | null = null;
    for (const exit of exitsForLocation(locationIdForPosition(position))) {
      const dx = exit.trigger.x - position.x;
      const dy = exit.trigger.y - position.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      if (distance > radius) continue;
      if (!best || distance < best.distance) best = { exit, distance };
    }
    return best?.exit ?? null;
  }

  private _beginExitTravel(exit: LocationExit): void {
    if (Date.now() - this._lastTravelAt < 500) return;
    this._pendingExit = exit;
    const local = this._localPosition();
    if (local && isWithinInteractionRange(local, exit.trigger, 0.18)) {
      void this._enterLocation(exit.targetId, exit.arrival);
      return;
    }

    const started = this.movementSystem.moveTo(exit.trigger.x, exit.trigger.y);
    this.setLocalAvatarState(null);
    if (!started) {
      this._pendingExit = null;
      this._showNotice(`Non riesco a raggiungere ${targetName(exit)}`);
    }
  }

  private _updatePendingExit(): void {
    if (!this._pendingExit || this.movementSystem.isMoving) return;
    const exit = this._pendingExit;
    const local = this._localPosition();
    if (!local || !isWithinInteractionRange(local, exit.trigger, 0.22)) return;
    void this._enterLocation(exit.targetId, exit.arrival);
  }

  private _checkExitTileTravel(): void {
    if (this._pendingExit || this.movementSystem.isMoving || Date.now() - this._lastTravelAt < 650) return;
    const local = this._localPosition();
    if (!local) return;
    const exit = exitsForLocation(locationIdForPosition(local)).find((candidate) => (
      isWithinInteractionRange(local, candidate.trigger, 0.22)
    ));
    if (exit) void this._enterLocation(exit.targetId, exit.arrival);
  }

  private _fastTravel(locationId: LocationId): void {
    const location = locationForId(locationId);
    if (!location) return;
    void this._enterLocation(location.id, location.spawn);
  }

  private async _enterLocation(locationId: LocationId, position: Position): Promise<void> {
    const location = locationForId(locationId);
    if (!location) return;

    this._pendingExit = null;
    this._lastTravelAt = Date.now();
    this._leaveSeat(true);
    this.movementSystem.stopMovement();
    this.setLocalAvatarTile(position.x, position.y, null);
    this._network?.emitMove(position.x, position.y, Direction.SE, 'idle', true);
    this._destroyAllRemotes();
    this._clearPetalBlooms();
    this._destroyLocationStations();
    this._lastLocalContextKey = '';
    const store = useGameStore.getState();
    store.setLocationName(location.name);
    store.setRouteHint(null);
    store.setTravelTargetName(location.name);
    this._showNotice(location.name);

    try {
      await this.refreshWorldAt(position.x, position.y);
    } finally {
      useGameStore.getState().setTravelTargetName(null);
    }
    this._rebuildLocationStations();
    this._rebuildExitStations();
    this._applyWaiterState(this._waiterState);
    this._syncJukeboxForLocation();
    this._syncLocalContext();
    void this._connectVoiceForCurrentLocation();
  }

  private _destroyAllRemotes(): void {
    this._remoteAvatars.forEach((avatar, userId) => {
      this.isoSystem.unregister(avatar);
      avatar.destroy();
      this._voice?.setParticipantVolume(userId, 0);
    });
    this._remoteAvatars.clear();
    useGameStore.getState().setUserActionMenu(null);
  }

  private _clearPetalBlooms(): void {
    this._petalBlooms.forEach((bloom) => bloom.station.destroy());
    this._petalBlooms = [];
  }

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

  private _sendChatMessage(text: string): void {
    this._network?.emitChatMessage(text);
  }

  private _applyChatMessage(message: ChatMessage): void {
    useGameStore.getState().addChatMessage(message);
    if (message.userId === this._myUserId) {
      this.localAvatar?.showChatBubble(message.text);
      return;
    }
    this._remoteAvatars.get(message.userId)?.showChatBubble(message.text);
  }

  private _callWaiter(): void {
    if (!this.localAvatar) return;
    if (!this._isInWaiterLocation()) {
      this._showNotice('Cameriere disponibile al bar');
      return;
    }
    if (!this._isNear(this._waiterPosition())) {
      this._showNotice('Avvicinati al cameriere');
      return;
    }

    this._network?.emitInteract(WAITER_OBJECT_ID, 'waiter-call', {
      x: Math.round(this.movementSystem.posX),
      y: Math.round(this.movementSystem.posY),
    });
  }

  private _placeWaiterOrder(item: OrderItemId): void {
    if (!this._isInWaiterLocation()) {
      this._showNotice('Ordini disponibili al bar');
      return;
    }
    if (!this._isNear(this._waiterPosition())) {
      this._showNotice('Avvicinati al cameriere');
      return;
    }
    if (!this._trySpendPetals()) return;

    this._network?.emitInteract(WAITER_OBJECT_ID, 'waiter-order', {
      item,
      x: Math.round(this.movementSystem.posX),
      y: Math.round(this.movementSystem.posY),
    });
  }

  private _ensureWaiterAvatar(waiter: WaiterState): RemoteAvatar {
    if (this._waiterAvatar) return this._waiterAvatar;

    const avatar = new RemoteAvatar({
      scene: this,
      username: 'Cameriere',
      worldX: waiter.x,
      worldY: waiter.y,
    });
    this._waiterAvatar = avatar;
    this.isoSystem.register(avatar, waiter.x, waiter.y);
    return avatar;
  }

  private _destroyWaiterAvatar(): void {
    if (!this._waiterAvatar) return;
    this.isoSystem.unregister(this._waiterAvatar);
    this._waiterAvatar.destroy();
    this._waiterAvatar = null;
  }

  private _applyWaiterState(rawState: unknown): void {
    const waiter = normalizeWaiterState(rawState);
    this._waiterState = waiter;

    if (!this._isInWaiterLocation()) {
      this._destroyWaiterAvatar();
      useGameStore.getState().setWaiterStatus(null);
      return;
    }

    useGameStore.getState().setWaiterStatus(waiter);

    const avatar = this._ensureWaiterAvatar(waiter);
    const moving = waiter.phase === 'approaching' ||
      waiter.phase === 'to-counter' ||
      waiter.phase === 'delivering' ||
      waiter.phase === 'returning';
    avatar.updateTarget(waiter.x, waiter.y, Direction.SE, moving ? 'walk' : 'idle');
    avatar.setHeldItem(waiter.phase === 'delivering' || waiter.phase === 'delivered'
      ? waiter.item ?? null
      : null);

    if (
      waiter.phase === 'delivered' &&
      waiter.customerId === this._myUserId &&
      waiter.orderId &&
      waiter.item &&
      !this._deliveredOrderIds.has(waiter.orderId)
    ) {
      this._deliveredOrderIds.add(waiter.orderId);
      this._pickUp(waiter.item, false);
      this._showNotice(`${waiter.item === 'beer' ? 'Birra' : 'Pretzel'} consegnato`);
    }
  }

  private _isInWaiterLocation(): boolean {
    return this._currentLocationId() === '0,0';
  }

  private _requestJukeboxToggle(): void {
    if (!this._isInJukeboxLocation()) {
      this._showNotice('Jukebox disponibile al bar');
      return;
    }
    if (!this._isNear(JUKEBOX_POSITION)) {
      this._showNotice('Avvicinati al jukebox');
      return;
    }

    if (this._jukeboxState.playing) {
      this._showNotice('Jukebox in corso');
      return;
    }

    if (useGameStore.getState().petals < JUKEBOX_PLAY_COST) {
      this._showNotice(`Servono ${JUKEBOX_PLAY_COST} petali`);
      return;
    }

    this._network?.emitInteract(JUKEBOX_OBJECT_ID, 'jukebox-toggle');
  }

  private _requestJukeboxNext(): void {
    if (!this._isInJukeboxLocation()) {
      this._showNotice('Jukebox disponibile al bar');
      return;
    }
    if (!this._isNear(JUKEBOX_POSITION)) {
      this._showNotice('Avvicinati al jukebox');
      return;
    }

    if (this._jukeboxState.playing) {
      this._showNotice('Jukebox in corso');
      return;
    }

    if (useGameStore.getState().petals < JUKEBOX_PLAY_COST) {
      this._showNotice(`Servono ${JUKEBOX_PLAY_COST} petali`);
      return;
    }

    this._network?.emitInteract(JUKEBOX_OBJECT_ID, 'jukebox-next');
  }

  private _requestJukeboxPlayUrl(url: string): void {
    if (!this._isInJukeboxLocation()) {
      this._showNotice('Jukebox disponibile al bar');
      return;
    }
    if (!this._isNear(JUKEBOX_POSITION)) {
      this._showNotice('Avvicinati al jukebox');
      return;
    }

    const externalTrack = parseJukeboxExternalTrack(url);
    if (!externalTrack) {
      this._showNotice('Link YouTube non valido');
      return;
    }

    if (this._jukeboxState.playing) {
      this._showNotice('Jukebox in corso');
      return;
    }

    if (useGameStore.getState().petals < JUKEBOX_PLAY_COST) {
      this._showNotice(`Servono ${JUKEBOX_PLAY_COST} petali`);
      return;
    }

    this._network?.emitInteract(JUKEBOX_OBJECT_ID, 'jukebox-play-url', { url });
  }

  private async _applyJukeboxState(rawState: unknown): Promise<void> {
    const state = normalizeJukeboxState(rawState);
    this._jukeboxState = state;
    if (!this._isInJukeboxLocation()) {
      await this._jukebox.applyState({ ...state, playing: false });
      useGameStore.getState().setJukeboxStatus(null);
      return;
    }

    const result = await this._jukebox.applyState(state);
    useGameStore.getState().setJukeboxStatus({
      trackId: state.trackId,
      title: state.externalTrack?.title ?? jukeboxTitle(state.trackId),
      playing: state.playing,
      blocked: result.blocked,
      source: state.externalTrack?.provider ?? 'local',
      expiresAt: state.expiresAt,
      externalUrl: state.externalTrack?.url,
    });
    if (result.blocked) this._showNotice('Clicca Play nel player del jukebox');
  }

  private _isInJukeboxLocation(): boolean {
    return this._currentLocationId() === '0,0';
  }

  private _syncJukeboxForLocation(): void {
    if (this._isInJukeboxLocation()) return;
    void this._jukebox.applyState({ ...this._jukeboxState, playing: false });
    useGameStore.getState().setJukeboxStatus(null);
  }

  private _syncJukeboxExpiry(): void {
    if (!this._jukeboxState.playing) return;
    const normalized = normalizeJukeboxState(this._jukeboxState);
    if (normalized.playing) return;
    this._jukeboxState = normalized;
    void this._applyJukeboxState(normalized);
  }

  private _applyObjectState(objectId: string, objectState: ObjectState): void {
    if (objectId === WAITER_OBJECT_ID) {
      this._applyWaiterState(objectState);
      return;
    }
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
      if (locationIdForPosition({ x, y }) !== this._currentLocationId()) return;
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

        const savedAvatar = useUserStore.getState().avatarConfig;
        const avatarConfig: AvatarConfig = savedAvatar ? {
          ...savedAvatar,
          userId: this._myUserId,
          username: username ?? 'Player',
        } : {
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
        useGameStore.getState().setUsersInRoom(roomState.totalUsers ?? roomState.users.length);
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

      onUserJoined: ({ userId, avatarConfig, position, state, heldItem }) => {
        if (userId === this._myUserId) return;
        this._spawnRemote(userId, avatarConfig.username, position.x, position.y, heldItem ?? null, state ?? 'idle');
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

      onUserChatMessage: (message) => {
        this._applyChatMessage(message);
      },

      onAccountUpdated: ({ petals, avatarConfig }) => {
        if (typeof petals === 'number') useGameStore.getState().setPetals(petals);
        if (avatarConfig) useUserStore.getState().setAvatarConfig(avatarConfig);
      },

      onError: ({ code, message }) => {
        console.error(`[Network] ${code}: ${message}`);
        if (message) this._showNotice(message);
      },
    });

    this._network.connect(username ?? 'Player', token ?? undefined);
  }

  // ── Voice ─────────────────────────────────────────────────────────────────

  private async _setupVoice(): Promise<void> {
    const { token } = useUserStore.getState();
    if (!token) return;
    // Dev escape hatch: skip voice so headless screenshot tooling can reach network idle.
    if (import.meta.env.DEV && new URLSearchParams(window.location.search).has('novoice')) return;

    if (!this._voice) {
      this._voice = new VoiceSystem();
      this._voice.setCallbacks({
        onConnected: () => useGameStore.getState().setVoiceAvailable(true),
        onDisconnected: () => useGameStore.getState().setVoiceAvailable(false),
        onSpeakingChanged: (userId, speaking) => this._onSpeakingChanged(userId, speaking),
      });
    }

    await this._connectVoiceForCurrentLocation();
  }

  private async _connectVoiceForCurrentLocation(): Promise<void> {
    const { token } = useUserStore.getState();
    if (!token || !this._voice) return;
    if (import.meta.env.DEV && new URLSearchParams(window.location.search).has('novoice')) return;

    const voiceRoomId = `bar:${this._currentLocationId()}`;
    const seq = ++this._voiceConnectSeq;
    await this._voice.connect(token, voiceRoomId);
    if (seq !== this._voiceConnectSeq) return;
    this._mutedVoiceUsers.forEach((userId) => this._voice?.setParticipantMuted(userId, true));
    this._syncVoiceSpatial(999);
  }

  private _syncVoiceSpatial(deltaMs: number): void {
    if (!this._voice?.isReady) return;
    this._voiceSpatialElapsed += deltaMs;
    if (this._voiceSpatialElapsed < 220) return;
    this._voiceSpatialElapsed = 0;

    const local = this._localPosition();
    if (!local) return;

    this._remoteAvatars.forEach((avatar, userId) => {
      const dx = avatar.worldX - local.x;
      const dy = avatar.worldY - local.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const volume = distance <= 2
        ? 1
        : Math.max(0.12, 1 - ((distance - 2) / 15) * 0.88);
      this._voice?.setParticipantVolume(userId, volume);
    });
  }

  private _setRemoteVoiceMuted(userId: string, muted: boolean): void {
    if (muted) this._mutedVoiceUsers.add(userId);
    else this._mutedVoiceUsers.delete(userId);

    this._voice?.setParticipantMuted(userId, muted);
    const avatar = this._remoteAvatars.get(userId);
    useGameStore.getState().setUserActionMenu(avatar ? {
      userId,
      username: avatar.username,
      muted,
    } : null);
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
    this._attachRemoteInteractions(userId, username, avatar);
    if (heldItem) avatar.setHeldItem(heldItem);
    avatar.playAnimation(state);
    this._remoteAvatars.set(userId, avatar);
    this.isoSystem.register(avatar, worldX, worldY);
    this._syncVoiceSpatial(999);
  }

  private _attachRemoteInteractions(userId: string, username: string, avatar: RemoteAvatar): void {
    let timer: Phaser.Time.TimerEvent | null = null;

    avatar.setData('interactable', true);
    avatar.setSize(44, 68);
    avatar.setInteractive(
      new Phaser.Geom.Rectangle(-22, -64, 44, 68),
      Phaser.Geom.Rectangle.Contains,
    );

    const clearTimer = () => {
      timer?.remove(false);
      timer = null;
    };

    avatar.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (pointer.button !== 0) return;
      clearTimer();
      timer = this.time.delayedCall(520, () => {
        timer = null;
        useGameStore.getState().setUserActionMenu({
          userId,
          username,
          muted: this._mutedVoiceUsers.has(userId),
        });
      });
    });
    avatar.on('pointerup', clearTimer);
    avatar.on('pointerout', clearTimer);
    avatar.on('pointerupoutside', clearTimer);
  }

  private _destroyRemote(userId: string): void {
    const avatar = this._remoteAvatars.get(userId);
    if (!avatar) return;
    this.isoSystem.unregister(avatar);
    avatar.destroy();
    this._remoteAvatars.delete(userId);
    this._voice?.setParticipantVolume(userId, 0);
    if (useGameStore.getState().userActionMenu?.userId === userId) {
      useGameStore.getState().setUserActionMenu(null);
    }
  }

  // ── Cleanup ───────────────────────────────────────────────────────────────

  private _onShutdown(): void {
    eventBus.off('exit-room');
    eventBus.off('voice-toggle');
    eventBus.off('audio-input-change');
    eventBus.off('emote');
    eventBus.off('leave-seat');
    eventBus.off('consume-held-item');
    eventBus.off('jukebox-toggle');
    eventBus.off('jukebox-next');
    eventBus.off('chat-send');
    eventBus.off('waiter-call');
    eventBus.off('waiter-order');
    eventBus.off('fast-travel');
    eventBus.off('voice-user-mute');
    eventBus.off('jukebox-play-url');
    this.input.keyboard?.off('keydown-B');
    this.input.keyboard?.off('keydown-ONE');
    this.input.keyboard?.off('keydown-TWO');
    this.input.keyboard?.off('keydown-THREE');
    this.input.keyboard?.off('keydown-J');
    this.input.keyboard?.off('keydown-M');
    this.input.off(Phaser.Input.Events.POINTER_DOWN, this._primePetalAudio, this);
    this._jukebox.destroy();
    this._network.leaveRoom('bar');
    this._network.disconnect();
    void this._voice?.disconnect();
    this._remoteAvatars.forEach((a) => a.destroy());
    this._remoteAvatars.clear();
    this._destroyWaiterAvatar();
    this._petalSpawnTimer?.remove(false);
    this._petalSpawnTimer = null;
    this._petalBlooms.forEach((bloom) => bloom.station.destroy());
    this._petalBlooms = [];
    this._exitStations.forEach((station) => station.destroy());
    this._exitStations = [];
    this._destroyLocationStations();
    this._seatOccupants.clear();
    this._pendingSeat = null;
    this._seatedSeatId = null;
    this._noticeText?.destroy();
    this._noticeText = null;
    this._deliveredOrderIds.clear();
    this.destroyWorld();
    this.input.setDefaultCursor('default');
    useGameStore.getState().setConnected(false);
    useGameStore.getState().setCurrentRoom(null);
    useGameStore.getState().setRoomName(null);
    useGameStore.getState().setLocationName(null);
    useGameStore.getState().setRouteHint(null);
    useGameStore.getState().setTravelTargetName(null);
    useGameStore.getState().setShowWorldMap(false);
    useGameStore.getState().setUserActionMenu(null);
    useGameStore.getState().setUsersInRoom(0);
    useGameStore.getState().setVoiceAvailable(false);
    useGameStore.getState().setVoiceMuted(false);
    useGameStore.getState().setHeldItem(null);
    useGameStore.getState().setJukeboxStatus(null);
    useGameStore.getState().setLocalAvatarState('idle');
    useGameStore.getState().clearChatMessages();
    useGameStore.getState().setWaiterStatus(null);
    useGameStore.getState().setWorldDebugMetrics(null);
    useGameStore.getState().setActionAvailability({
      nearJukebox: false,
      nearWaiter: false,
      canAffordAction: useGameStore.getState().petals >= PETAL_ACTION_COST,
    });
    this._lastLocalContextKey = '';
  }
}
