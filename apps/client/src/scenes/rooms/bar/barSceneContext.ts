/**
 * BarSceneContext
 *
 * Shared `this` type for all bar/*Methods.ts modules.
 * Each module is called via `fn.call(this)` from BarScene, so `this` is always
 * a live BarScene instance — but declaring it as `this: any` in every module
 * disables the type-checker inside those functions.
 *
 * Replace `this: any` with `this: BarSceneContext` in each module to restore
 * full compiler checking without changing runtime behavior.
 *
 * The interface extends Phaser.Scene so engine members (`add`, `tweens`,
 * `time`, `input`, `events`, `scene`, `cameras`, `scale`) are typed via
 * inheritance. All private BarScene fields and the cross-module private method
 * stubs are listed below.
 */

import type { JukeboxPlayer } from '../../../audio/JukeboxPlayer';
import type { Avatar } from '../../../entities/Avatar';
import type { InteractStation } from '../../../entities/InteractStation';
import type { RemoteAvatar } from '../../../entities/RemoteAvatar';
import type { IsometricSystem } from '../../../systems/IsometricSystem';
import type { MovementSystem } from '../../../systems/MovementSystem';
import type { NetworkSystem } from '../../../systems/NetworkSystem';
import type { VoiceSystem } from '../../../systems/VoiceSystem';
import type { WorldMap } from '../../../world/WorldMap';
import type { SeatDefinition } from '../../../world/interactions';
import type { LocationExit, LocationId } from '../../../world/locations';
import type {
  AvatarState,
  JukeboxState,
  ObjectState,
  PoolState,
  Position,
  WaiterState,
} from '@social-square/shared';
import type { PetalBloom, PendingPetalCollect } from './petalMethods';

// PoolState is re-exported from @social-square/shared but normalizePoolState returns it
// directly; import it here so the field type is concrete.

export interface BarSceneContext extends Phaser.Scene {
  // ─── BaseRoomScene protected members ────────────────────────────────────────
  isoSystem: IsometricSystem;
  movementSystem: MovementSystem;
  localAvatar: Avatar;
  worldMap: WorldMap;

  // ─── BarScene private fields ─────────────────────────────────────────────────
  _network: NetworkSystem;
  _voice: VoiceSystem | null;
  _remoteAvatars: Map<string, RemoteAvatar>;
  _movingRemoteAvatars: Set<string>;
  _myUserId: string | null;
  _stations: InteractStation[];
  _exitStations: InteractStation[];
  _petalBlooms: PetalBloom[];
  _pendingPetalCollects: Map<string, PendingPetalCollect>;
  _petalAttemptCooldowns: Map<string, number>;
  _lastPetalSpawnByLocation: Map<string, number>;
  _petalSpawnTimer: Phaser.Time.TimerEvent | null;
  _sipsLeft: number;
  _jukebox: JukeboxPlayer;
  _jukeboxState: JukeboxState;
  _poolState: PoolState;
  _seatOccupants: Map<string, string>;
  _pendingSeat: SeatDefinition | null;
  _seatedSeatId: string | null;
  _noticeText: Phaser.GameObjects.Text | null;
  _waiterAvatar: RemoteAvatar | null;
  _waiterState: WaiterState;
  _deliveredOrderIds: Set<string>;
  _lastLocalContextKey: string;
  _pendingExit: LocationExit | null;
  _lastTravelAt: number;
  _voiceConnectSeq: number;
  _voiceSpatialElapsed: number;
  _localContextElapsed: number;
  _petalCollectElapsed: number;
  _jukeboxSpatialElapsed: number;
  _jukeboxExpiryElapsed: number;
  _mutedVoiceUsers: Set<string>;
  _speakingVoiceUsers: Set<string>;
  _lastSpeakingUiKey: string;

  // ─── BaseRoomScene protected methods ────────────────────────────────────────
  setLocalAvatarState(state: AvatarState | null): void;
  setLocalAvatarTile(x: number, y: number, state?: AvatarState | null): void;
  refreshWorldAt(x: number, y: number): Promise<void>;
  destroyWorld(): void;

  // ─── Private BarScene methods (cross-module stubs) ───────────────────────────
  // These are the private methods of BarScene that modules call on `this`.
  // They are typed here so modules can reference them without `any`.

  // location
  _currentLocationId(): LocationId | string;
  _rebuildExitStations(): void;
  _nearestExit(position: Position, radius?: number): LocationExit | null;
  _beginExitTravel(exit: LocationExit): void;
  _updatePendingExit(): void;
  _checkExitTileTravel(): void;
  _fastTravel(locationId: LocationId): void;
  _enterLocation(locationId: LocationId, position: Position): Promise<void>;

  // stations / context
  _rebuildLocationStations(): void;
  _destroyLocationStations(): void;
  _pickUpFromStation(item: import('@social-square/shared').HeldItem, position: Position): void;
  _pickUp(item: import('@social-square/shared').HeldItem): void;
  _consume(): void;
  _localPosition(): Position | null;
  _isNear(position: Position, radius?: number): boolean;
  _syncLocalContext(): void;
  _showNotice(message: string): void;
  _waiterPosition(): Position;

  // petals
  _startPetalSpawns(): void;
  _seedPetalBloomsForLocation(): void;
  _maybeSpawnPetalBloom(): void;
  _spawnPetalBloom(): boolean;
  _createPetalBloom(position: Position, amount: number): PetalBloom;
  _sweepStalePetalCollects(): void;
  _collectNearbyPetals(): void;
  _collectPetalBloom(bloom: PetalBloom, automatic?: boolean): void;
  _confirmPetalCollected(position: Position, amount: number, petals: number, requestId?: string): void;
  _removePetalBloom(bloom: PetalBloom): void;
  _syncPetalPositionForServer(): Position | null;
  _rollbackPendingPetalCollect(requestId: string | undefined, message: string): void;
  _rollbackLatestPendingPetalCollect(message: string): void;
  _forgetLatestPendingPetalCollect(): void;
  _forgetPendingPetalCollect(requestId: string): void;
  _removeOptimisticPetalCredit(pending: PendingPetalCollect): void;
  _applyServerPetals(petals: number): void;
  _acceptPetalServerTotal(petals: number): void;
  _pendingPetalValue(): number;
  _spawnPetalCollectBurst(position: Position, amount: number): void;
  _playPetalCollectSound(): void;
  _primePetalAudio(): void;
  _getPetalAudioContext(): AudioContext | null;
  _clearPetalBlooms(): void;

  // seats
  _beginSeatInteraction(seat: SeatDefinition): void;
  _updatePendingSeat(): void;
  _requestSit(seat: SeatDefinition): void;
  _leaveSeat(emit: boolean): void;
  _applySeatState(objectId: string, objectState: ObjectState): void;

  // jukebox
  _requestJukeboxToggle(): void;
  _requestJukeboxNext(): void;
  _requestJukeboxPlayUrl(url: string): void;
  _applyJukeboxState(rawState: unknown): Promise<void>;
  _isInJukeboxLocation(): boolean;
  _syncJukeboxForLocation(): void;
  _syncJukeboxSpatial(): void;
  _syncJukeboxExpiry(): void;

  // pool
  _requestPoolOpen(): void;
  _requestPoolStart(action: 'pool-start-solo' | 'pool-create-duo' | 'pool-join-duo'): void;
  _requestPoolShot(shot: { angle: number; power: number; spin?: number }): void;
  _requestPoolSync(payload: { balls: import('@social-square/shared').PoolBall[]; scratched: boolean }): void;
  _requestPoolPlaceCue(payload: { x: number; y: number }): void;
  _requestPoolLeave(): void;
  _applyPoolState(rawState: unknown): void;
  _isInPoolLocation(): boolean;
  _showPoolMessage(message: string, tone: 'info' | 'error'): void;
  _syncPoolPositionForServer(): Position | null;

  // waiter
  _callWaiter(): void;
  _placeWaiterOrder(item: import('@social-square/shared').OrderItemId): void;
  _ensureWaiterAvatar(waiter: WaiterState): RemoteAvatar;
  _destroyWaiterAvatar(): void;
  _applyWaiterState(rawState: unknown): void;
  _isInWaiterLocation(): boolean;

  // network / remote avatars
  _setupNetwork(): void;
  _joinNetworkRoom(roomId: string, name: string): void;
  _destroyAllRemotes(): void;
  _spawnRemote(
    userId: string,
    username: string,
    worldX: number,
    worldY: number,
    heldItem?: import('@social-square/shared').HeldItem,
    state?: AvatarState,
    avatarConfig?: import('@social-square/shared').AvatarConfig,
  ): void;
  _updateRemoteAvatar(userId: string, avatarConfig: import('@social-square/shared').AvatarConfig): void;
  _setRemoteAvatarActive(userId: string, active: boolean): void;
  _attachRemoteInteractions(userId: string, username: string, avatar: RemoteAvatar): void;
  _destroyRemote(userId: string): void;

  // voice
  _setupVoice(): Promise<void>;
  _connectVoiceForCurrentLocation(): Promise<void>;
  _syncVoiceSpatial(deltaMs: number): void;
  _setRemoteVoiceMuted(userId: string, muted: boolean): void;
  _onSpeakingChanged(userId: string, speaking: boolean): void;
  _spatialFrom(
    listener: Position,
    source: Position,
    maxDistance: number,
    minVolume: number,
  ): { volume: number; pan: number; distance: number };
  _setSpeakingUi(
    users: Array<{ userId: string; username: string; distance: number; volume: number; pan: number }>,
  ): void;
  _loadMutedVoiceUsers(): void;
  _saveMutedVoiceUsers(): void;
}
