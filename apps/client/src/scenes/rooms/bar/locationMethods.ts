import { Direction, type Position } from '@social-square/shared';
import { InteractStation } from '../../../entities/InteractStation';
import { t } from '../../../i18n';
import { useGameStore } from '../../../store/gameStore';
import { isWithinInteractionRange } from '../../../world/interactions';
import {
  exitsForLocation,
  locationForId,
  locationIdForPosition,
  targetName,
  type LocationExit,
  type LocationId,
} from '../../../world/locations';
import { drawExitMarker } from './stationIcons';
import type { BarSceneContext } from './barSceneContext';

export function currentLocationId(this: BarSceneContext): LocationId | string {
  const local = this._localPosition();
  return local ? locationIdForPosition(local) : '0,0';
}

export function rebuildExitStations(this: BarSceneContext): void {
  this._exitStations.forEach((station: InteractStation) => station.destroy());
  this._exitStations = [];

  for (const exit of exitsForLocation(this._currentLocationId())) {
    this._exitStations.push(new InteractStation({
      scene: this,
      worldX: exit.trigger.x,
      worldY: exit.trigger.y,
      label: t('bar.station.route', { target: targetName(exit) }),
      draw: drawExitMarker,
      hitWidth: 62,
      hitHeight: 38,
      ambientGlow: true,
      onInteract: () => this._beginExitTravel(exit),
    }));
  }
}

export function nearestExit(this: BarSceneContext, position: Position, radius = 4.25): LocationExit | null {
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

export function beginExitTravel(this: BarSceneContext, exit: LocationExit): void {
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
    this._showNotice(t('bar.notice.routeBlocked', { target: targetName(exit) }));
  }
}

export function updatePendingExit(this: BarSceneContext): void {
  if (!this._pendingExit || this.movementSystem.isMoving) return;
  const exit = this._pendingExit;
  const local = this._localPosition();
  if (!local || !isWithinInteractionRange(local, exit.trigger, 0.22)) return;
  void this._enterLocation(exit.targetId, exit.arrival);
}

export function checkExitTileTravel(this: BarSceneContext): void {
  if (this._pendingExit || this.movementSystem.isMoving || Date.now() - this._lastTravelAt < 650) return;
  const local = this._localPosition();
  if (!local) return;
  const exit = exitsForLocation(locationIdForPosition(local)).find((candidate) => (
    isWithinInteractionRange(local, candidate.trigger, 0.22)
  ));
  if (exit) void this._enterLocation(exit.targetId, exit.arrival);
}

export function fastTravel(this: BarSceneContext, locationId: LocationId): void {
  const location = locationForId(locationId);
  if (!location) return;
  void this._enterLocation(location.id, location.spawn);
}

export async function enterLocation(this: BarSceneContext, locationId: LocationId, position: Position): Promise<void> {
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
  this._seedPetalBloomsForLocation();
  this._applyWaiterState(this._waiterState);
  this._syncJukeboxForLocation();
  this._applyPoolState(this._poolState);
  this._syncLocalContext();
  void this._connectVoiceForCurrentLocation();
}
