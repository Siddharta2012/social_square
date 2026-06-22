import { t } from '../../../i18n';
import { isWithinInteractionRange, type SeatDefinition } from '../../../world/interactions';
import { locationIdForPosition } from '../../../world/locations';
import type { ObjectState } from '@social-square/shared';
import type { BarSceneContext } from './barSceneContext';

export function beginSeatInteraction(this: BarSceneContext, seat: SeatDefinition): void {
  const occupant = this._seatOccupants.get(seat.id);
  if (occupant && occupant !== this._myUserId) {
    this._showNotice(t('bar.notice.seatOccupied'));
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
    this._showNotice(t('bar.notice.seatBlocked'));
    return;
  }

  const started = this.movementSystem.moveTo(seat.x, seat.y);
  this.setLocalAvatarState(null);
  if (!started) this._requestSit(seat);
}

export function updatePendingSeat(this: BarSceneContext): void {
  if (!this._pendingSeat || this.movementSystem.isMoving) return;
  const seat = this._pendingSeat;
  const local = { x: this.movementSystem.posX, y: this.movementSystem.posY };
  if (!isWithinInteractionRange(local, seat, 0.08)) return;

  this._pendingSeat = null;
  this._requestSit(seat);
}

export function requestSit(this: BarSceneContext, seat: SeatDefinition): void {
  this._network?.emitInteract(seat.id, 'seat-sit', { x: seat.x, y: seat.y });
  this._applySeatState(seat.id, { kind: 'seat', occupiedBy: this._myUserId, x: seat.x, y: seat.y });
}

export function leaveSeat(this: BarSceneContext, emit: boolean): void {
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

export function applySeatState(this: BarSceneContext, objectId: string, objectState: ObjectState): void {
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
