/**
 * BarScene — first multiplayer room.
 * 18×17 isometric grid with bar-themed layout.
 * Connects to the server via NetworkSystem and manages remote avatars.
 */

import {
  Direction,
  POOL_OBJECT_ID,
  WAITER_OBJECT_ID,
  normalizeJukeboxState,
  normalizePoolState,
  normalizeWaiterState,
} from '@social-square/shared';
import { JukeboxPlayer } from '../../audio/JukeboxPlayer';
import { InteractStation } from '../../entities/InteractStation';
import { RemoteAvatar } from '../../entities/RemoteAvatar';
import { eventBus } from '../../eventBus';
import { useGameStore } from '../../store/gameStore';
import { useUserStore } from '../../store/userStore';
import { NetworkSystem } from '../../systems/NetworkSystem';
import {
  INTERACTION_RADIUS_TILES,
  JUKEBOX_OBJECT_ID,
  JUKEBOX_POSITION,
  SEAT_DEFINITIONS,
  isSeatObjectId,
  type SeatDefinition,
} from '../../world/interactions';
import {
  locationIdForPosition,
  type LocationExit,
  type LocationId,
} from '../../world/locations';
import * as jukeboxMethods from './bar/jukeboxMethods';
import * as locationMethods from './bar/locationMethods';
import * as networkMethods from './bar/networkMethods';
import * as petalMethods from './bar/petalMethods';
import * as poolMethods from './bar/poolMethods';
import * as remoteMethods from './bar/remoteMethods';
import * as seatMethods from './bar/seatMethods';
import * as shutdownMethods from './bar/shutdownMethods';
import * as stationMethods from './bar/stationMethods';
import * as voiceMethods from './bar/voiceMethods';
import * as waiterMethods from './bar/waiterMethods';
import { BaseRoomScene, type WorldConfig } from './BaseRoomScene';
import type { PendingPetalCollect, PetalBloom } from './bar/petalMethods';
import type { VoiceSystem } from '../../systems/VoiceSystem';
import type {
  AvatarState,
  ChatMessage,
  EmoteId,
  HeldItem,
  JukeboxState,
  ObjectState,
  OrderItemId,
  PoolBall,
  Position,
  WaiterState,
  AvatarConfig,
} from '@social-square/shared';

// ─── Station icon drawing ──────────────────────────────────────────────────────
// All icons drawn centered on (0,0); base sits ~y=-26 to rest on the counter top
// (the counter surface is at roughly y=-26; lower values would land on the front face).

// ─── Scene ───────────────────────────────────────────────────────────────────
export class BarScene extends BaseRoomScene {
  private _network!: NetworkSystem;
  private _voice: VoiceSystem | null = null;
  private _remoteAvatars = new Map<string, RemoteAvatar>();
  private _movingRemoteAvatars = new Set<string>();
  private _myUserId: string | null = null;
  private _stations: InteractStation[] = [];
  private _exitStations: InteractStation[] = [];
  private _petalBlooms: PetalBloom[] = [];
  private _pendingPetalCollects = new Map<string, PendingPetalCollect>();
  private _petalAttemptCooldowns = new Map<string, number>();
  private _lastPetalSpawnByLocation = new Map<string, number>();
  private _petalSpawnTimer: Phaser.Time.TimerEvent | null = null;
  private _sipsLeft = 0;
  private _jukebox = new JukeboxPlayer();
  private _jukeboxState: JukeboxState = normalizeJukeboxState(null);
  private _poolState = normalizePoolState(null);
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
  private _jukeboxSpatialElapsed = 0;
  private _jukeboxExpiryElapsed = 0;
  private _mutedVoiceUsers = new Set<string>();
  private _speakingVoiceUsers = new Set<string>();
  private _lastSpeakingUiKey = '';

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
    this._network?.emitMove(x, y, Direction.SE, moving ? 'walk' : 'idle', !moving);
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

  protected override isLocalMovementLocked(): boolean {
    return useGameStore.getState().showPoolOverlay;
  }

  create(): void {
    super.create();
    this._loadMutedVoiceUsers();
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
    eventBus.on('pool-open', () => this._requestPoolOpen(), this);
    eventBus.on('pool-start-solo', () => this._requestPoolStart('pool-start-solo'), this);
    eventBus.on('pool-create-duo', () => this._requestPoolStart('pool-create-duo'), this);
    eventBus.on('pool-join-duo', () => this._requestPoolStart('pool-join-duo'), this);
    eventBus.on('pool-shot', (shot: { angle: number; power: number; spin?: number }) => this._requestPoolShot(shot), this);
    eventBus.on('pool-sync', (payload: { balls: PoolBall[]; scratched: boolean }) => this._requestPoolSync(payload), this);
    eventBus.on('pool-place-cue', (payload: { x: number; y: number }) => this._requestPoolPlaceCue(payload), this);
    eventBus.on('pool-leave', () => this._requestPoolLeave(), this);
    eventBus.on('whisper-send', (payload: { toUserId: string; text: string }) => {
      this._network?.emitWhisperMessage(payload.toUserId, payload.text);
    }, this);
    eventBus.on('private-room-join', (payload: { roomId: string; name: string }) => {
      this._joinNetworkRoom(payload.roomId, payload.name);
    }, this);
    eventBus.on('avatar-updated', (avatarConfig: AvatarConfig) => {
      this.localAvatar?.setAvatarConfig(avatarConfig);
      this._network?.updateAvatar(avatarConfig);
    }, this);
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
    this._syncPoolInputLock();
    super.update(time, delta);
    this._movingRemoteAvatars.forEach((userId) => {
      const avatar = this._remoteAvatars.get(userId);
      if (!avatar || !avatar.tick()) this._movingRemoteAvatars.delete(userId);
    });
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
    this._jukeboxSpatialElapsed += delta;
    if (this._jukeboxSpatialElapsed >= 120) {
      this._jukeboxSpatialElapsed = 0;
      this._syncJukeboxSpatial();
    }
    this._jukeboxExpiryElapsed += delta;
    if (this._jukeboxExpiryElapsed >= 500) {
      this._jukeboxExpiryElapsed = 0;
      this._syncJukeboxExpiry();
    }
    this._petalCollectElapsed += delta;
    if (this._petalCollectElapsed >= petalMethods.PETAL_AUTO_COLLECT_CHECK_MS) {
      this._petalCollectElapsed = 0;
      this._sweepStalePetalCollects();
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
    stationMethods.rebuildLocationStations.call(this);
  }

  private _destroyLocationStations(): void {
    stationMethods.destroyLocationStations.call(this);
  }

  private _pickUpFromStation(item: HeldItem, position: Position): void {
    stationMethods.pickUpFromStation.call(this, item, position);
  }

  private _pickUp(item: HeldItem): void {
    stationMethods.pickUp.call(this, item);
  }

  private _consume(): void {
    stationMethods.consume.call(this);
  }

  // ── Network setup ─────────────────────────────────────────────────────────

  private _localPosition(): Position | null {
    return stationMethods.localPosition.call(this);
  }

  private _waiterPosition(): Position {
    return waiterMethods.waiterPosition.call(this);
  }

  private _isNear(position: Position, radius = INTERACTION_RADIUS_TILES): boolean {
    return stationMethods.isNear.call(this, position, radius);
  }

  private _syncLocalContext(): void {
    stationMethods.syncLocalContext.call(this);
  }

  private _startPetalSpawns(): void {
    petalMethods.startPetalSpawns.call(this);
  }

  private _seedPetalBloomsForLocation(): void {
    petalMethods.seedPetalBloomsForLocation.call(this);
  }

  private _maybeSpawnPetalBloom(): void {
    petalMethods.maybeSpawnPetalBloom.call(this);
  }

  private _spawnPetalBloom(): boolean {
    return petalMethods.spawnPetalBloom.call(this);
  }

  private _createPetalBloom(position: Position, amount: number): PetalBloom {
    return petalMethods.createPetalBloom.call(this, position, amount);
  }

  private _sweepStalePetalCollects(): void {
    petalMethods.sweepStalePetalCollects.call(this);
  }

  private _collectNearbyPetals(): void {
    petalMethods.collectNearbyPetals.call(this);
  }

  private _collectPetalBloom(bloom: PetalBloom, automatic = false): void {
    petalMethods.collectPetalBloom.call(this, bloom, automatic);
  }

  private _confirmPetalCollected(position: Position, amount: number, petals: number, requestId?: string): void {
    petalMethods.confirmPetalCollected.call(this, position, amount, petals, requestId);
  }

  private _removePetalBloom(bloom: PetalBloom): void {
    petalMethods.removePetalBloom.call(this, bloom);
  }

  private _syncPetalPositionForServer(): Position | null {
    return petalMethods.syncPetalPositionForServer.call(this);
  }

  private _rollbackPendingPetalCollect(requestId: string | undefined, message: string): void {
    petalMethods.rollbackPendingPetalCollect.call(this, requestId, message);
  }

  private _rollbackLatestPendingPetalCollect(message: string): void {
    petalMethods.rollbackLatestPendingPetalCollect.call(this, message);
  }

  private _forgetLatestPendingPetalCollect(): void {
    petalMethods.forgetLatestPendingPetalCollect.call(this);
  }

  private _forgetPendingPetalCollect(requestId: string): void {
    petalMethods.forgetPendingPetalCollect.call(this, requestId);
  }

  private _removeOptimisticPetalCredit(pending: PendingPetalCollect): void {
    petalMethods.removeOptimisticPetalCredit.call(this, pending);
  }

  private _applyServerPetals(petals: number): void {
    petalMethods.applyServerPetals.call(this, petals);
  }

  private _acceptPetalServerTotal(petals: number): void {
    petalMethods.acceptPetalServerTotal.call(this, petals);
  }

  private _pendingPetalValue(): number {
    return petalMethods.pendingPetalValue.call(this);
  }

  private _spawnPetalCollectBurst(position: Position, amount: number): void {
    petalMethods.spawnPetalCollectBurst.call(this, position, amount);
  }

  private _playPetalCollectSound(): void {
    petalMethods.playPetalCollectSound.call(this);
  }

  private _primePetalAudio(): void {
    petalMethods.primePetalAudio.call(this);
  }

  private _getPetalAudioContext(): AudioContext | null {
    return petalMethods.getPetalAudioContext();
  }

  private _currentLocationId(): LocationId | string {
    return locationMethods.currentLocationId.call(this);
  }

  private _rebuildExitStations(): void {
    locationMethods.rebuildExitStations.call(this);
  }

  private _nearestExit(position: Position, radius = 4.25): LocationExit | null {
    return locationMethods.nearestExit.call(this, position, radius);
  }

  private _beginExitTravel(exit: LocationExit): void {
    locationMethods.beginExitTravel.call(this, exit);
  }

  private _updatePendingExit(): void {
    locationMethods.updatePendingExit.call(this);
  }

  private _checkExitTileTravel(): void {
    locationMethods.checkExitTileTravel.call(this);
  }

  private _fastTravel(locationId: LocationId): void {
    locationMethods.fastTravel.call(this, locationId);
  }

  private async _enterLocation(locationId: LocationId, position: Position): Promise<void> {
    await locationMethods.enterLocation.call(this, locationId, position);
  }

  private _destroyAllRemotes(): void {
    remoteMethods.destroyAllRemotes.call(this);
  }

  private _clearPetalBlooms(): void {
    petalMethods.clearPetalBlooms.call(this);
  }

  private _beginSeatInteraction(seat: SeatDefinition): void {
    seatMethods.beginSeatInteraction.call(this, seat);
  }

  private _updatePendingSeat(): void {
    seatMethods.updatePendingSeat.call(this);
  }

  private _requestSit(seat: SeatDefinition): void {
    seatMethods.requestSit.call(this, seat);
  }

  private _leaveSeat(emit: boolean): void {
    seatMethods.leaveSeat.call(this, emit);
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
    waiterMethods.callWaiter.call(this);
  }

  private _placeWaiterOrder(item: OrderItemId): void {
    waiterMethods.placeWaiterOrder.call(this, item);
  }

  private _ensureWaiterAvatar(waiter: WaiterState): RemoteAvatar {
    return waiterMethods.ensureWaiterAvatar.call(this, waiter);
  }

  private _destroyWaiterAvatar(): void {
    waiterMethods.destroyWaiterAvatar.call(this);
  }

  private _applyWaiterState(rawState: unknown): void {
    waiterMethods.applyWaiterState.call(this, rawState);
  }

  private _isInWaiterLocation(): boolean {
    return waiterMethods.isInWaiterLocation.call(this);
  }

  private _requestJukeboxToggle(): void {
    jukeboxMethods.requestJukeboxToggle.call(this);
  }

  private _requestJukeboxNext(): void {
    jukeboxMethods.requestJukeboxNext.call(this);
  }

  private _requestJukeboxPlayUrl(url: string): void {
    jukeboxMethods.requestJukeboxPlayUrl.call(this, url);
  }

  private async _applyJukeboxState(rawState: unknown): Promise<void> {
    await jukeboxMethods.applyJukeboxState.call(this, rawState);
  }

  private _isInJukeboxLocation(): boolean {
    return jukeboxMethods.isInJukeboxLocation.call(this);
  }

  private _requestPoolOpen(): void {
    poolMethods.requestPoolOpen.call(this);
  }

  private _requestPoolStart(action: 'pool-start-solo' | 'pool-create-duo' | 'pool-join-duo'): void {
    poolMethods.requestPoolStart.call(this, action);
  }

  private _requestPoolShot(shot: { angle: number; power: number; spin?: number }): void {
    poolMethods.requestPoolShot.call(this, shot);
  }

  private _requestPoolSync(payload: { balls: PoolBall[]; scratched: boolean }): void {
    poolMethods.requestPoolSync.call(this, payload);
  }

  private _requestPoolPlaceCue(payload: { x: number; y: number }): void {
    poolMethods.requestPoolPlaceCue.call(this, payload);
  }

  private _requestPoolLeave(): void {
    poolMethods.requestPoolLeave.call(this);
  }

  private _applyPoolState(rawState: unknown): void {
    poolMethods.applyPoolState.call(this, rawState);
  }

  private _isInPoolLocation(): boolean {
    return poolMethods.isInPoolLocation.call(this);
  }

  private _showPoolMessage(message: string, tone: 'info' | 'error'): void {
    poolMethods.showPoolMessage.call(this, message, tone);
  }

  private _syncPoolInputLock(): void {
    const locked = useGameStore.getState().showPoolOverlay;
    if (this.input.enabled === !locked) return;
    this.input.enabled = !locked;
  }

  private _syncPoolPositionForServer(): Position | null {
    return poolMethods.syncPoolPositionForServer.call(this);
  }

  private _syncJukeboxForLocation(): void {
    jukeboxMethods.syncJukeboxForLocation.call(this);
  }

  private _syncJukeboxSpatial(): void {
    jukeboxMethods.syncJukeboxSpatial.call(this);
  }

  private _syncJukeboxExpiry(): void {
    jukeboxMethods.syncJukeboxExpiry.call(this);
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
    if (objectId === POOL_OBJECT_ID) {
      this._applyPoolState(objectState);
      return;
    }
    if (isSeatObjectId(objectId)) this._applySeatState(objectId, objectState);
  }

  private _applySeatState(objectId: string, objectState: ObjectState): void {
    seatMethods.applySeatState.call(this, objectId, objectState);
  }

  private _showNotice(message: string): void {
    stationMethods.showNotice.call(this, message);
  }

  private _setupNetwork(): void {
    networkMethods.setupNetwork.call(this);
  }

  private _joinNetworkRoom(roomId: string, name: string): void {
    const store = useUserStore.getState();
    const avatarConfig: AvatarConfig = store.avatarConfig ? {
      ...store.avatarConfig,
      userId: this._myUserId ?? store.userId ?? 'local',
      username: store.username ?? 'Player',
    } : {
      userId: this._myUserId ?? store.userId ?? 'local',
      username: store.username ?? 'Player',
      body: 0,
      outfit: 0,
      hair: 0,
      hairColor: '#4488ff',
      accessory: 0,
      expression: 0,
    };
    this._destroyAllRemotes();
    useGameStore.getState().setCurrentRoom(roomId);
    useGameStore.getState().setRoomName(name);
    this._network.joinRoom(roomId, avatarConfig);
  }

  // ── Voice ─────────────────────────────────────────────────────────────────

  private async _setupVoice(): Promise<void> {
    await voiceMethods.setupVoice.call(this);
  }

  private async _connectVoiceForCurrentLocation(): Promise<void> {
    await voiceMethods.connectVoiceForCurrentLocation.call(this);
  }

  private _syncVoiceSpatial(deltaMs: number): void {
    voiceMethods.syncVoiceSpatial.call(this, deltaMs);
  }

  private _setRemoteVoiceMuted(userId: string, muted: boolean): void {
    voiceMethods.setRemoteVoiceMuted.call(this, userId, muted);
  }

  private _onSpeakingChanged(userId: string, speaking: boolean): void {
    if (userId === this._myUserId) {
      // Local avatar — find it via the scene's local avatar reference
      this.localAvatar?.setSpeaking(speaking);
      return;
    }
    if (speaking) this._speakingVoiceUsers.add(userId);
    else this._speakingVoiceUsers.delete(userId);
    this._remoteAvatars.get(userId)?.setSpeaking(speaking);
    this._syncVoiceSpatial(999);
  }

  // ── Remote avatar management ──────────────────────────────────────────────

  private _spatialFrom(
    listener: Position,
    source: Position,
    maxDistance: number,
    minVolume: number,
  ): { volume: number; pan: number; distance: number } {
    return voiceMethods.spatialFrom(listener, source, maxDistance, minVolume);
  }

  private _setSpeakingUi(users: Array<{ userId: string; username: string; distance: number; volume: number; pan: number }>): void {
    voiceMethods.setSpeakingUi.call(this, users);
  }

  private _loadMutedVoiceUsers(): void {
    voiceMethods.loadMutedVoiceUsers.call(this);
  }

  private _saveMutedVoiceUsers(): void {
    voiceMethods.saveMutedVoiceUsers.call(this);
  }

  private _spawnRemote(
    userId: string,
    username: string,
    worldX: number,
    worldY: number,
    heldItem: HeldItem = null,
    state: AvatarState = 'idle',
    avatarConfig?: AvatarConfig,
  ): void {
    remoteMethods.spawnRemote.call(this, userId, username, worldX, worldY, heldItem, state, avatarConfig);
  }

  private _updateRemoteAvatar(userId: string, avatarConfig: AvatarConfig): void {
    remoteMethods.updateRemoteAvatar.call(this, userId, avatarConfig);
  }

  private _setRemoteAvatarActive(userId: string, active: boolean): void {
    if (active) this._movingRemoteAvatars.add(userId);
    else this._movingRemoteAvatars.delete(userId);
  }

  private _attachRemoteInteractions(userId: string, username: string, avatar: RemoteAvatar): void {
    remoteMethods.attachRemoteInteractions.call(this, userId, username, avatar);
  }

  private _destroyRemote(userId: string): void {
    remoteMethods.destroyRemote.call(this, userId);
  }

  // ── Cleanup ───────────────────────────────────────────────────────────────

  private _onShutdown(): void {
    shutdownMethods.onShutdown.call(this);
  }
}
