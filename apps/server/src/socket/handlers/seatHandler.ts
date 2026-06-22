import { Direction, isSeatObjectId } from '@social-square/shared';
import {
  emitObjectStateChangedToInterested,
  emitPoseChangeWithInterest,
} from './interestBroadcaster';
import { state, type IoServer, type IoSocket } from './roomContext';
import { persistUserPosition, seatPositionFrom } from './roomUtils';
import type { AvatarState, ObjectState } from '@social-square/shared';

export async function handleSeatInteraction(
  io: IoServer,
  socket: IoSocket,
  roomId: string,
  userId: string,
  objectId: string,
  action: string,
  payload: ObjectState,
): Promise<boolean> {
  if (!isSeatObjectId(objectId)) return false;

  const current = await state.getObjectState(roomId, objectId) ?? {};
  const occupiedBy = typeof current.occupiedBy === 'string' ? current.occupiedBy : null;
  const now = Date.now();

  if (action === 'seat-sit') {
    if (occupiedBy && occupiedBy !== userId) {
      socket.emit('error', { code: 'SEAT_OCCUPIED', message: 'Seduta occupata' });
      return true;
    }

    const position = seatPositionFrom(payload);
    if (!position) {
      socket.emit('error', { code: 'INVALID_SEAT', message: 'Seduta non valida' });
      return true;
    }

    const next: ObjectState = {
      kind: 'seat',
      occupiedBy: userId,
      x: position.x,
      y: position.y,
      updatedAt: now,
    };

    const roomState = await state.getRoomState(roomId);
    const previous = roomState.users.find((user) => user.userId === userId)?.position ?? position;
    await state.updateObjectState(roomId, objectId, next);
    await state.updatePose(roomId, userId, position, 'sit');
    await persistUserPosition(userId, roomId, position);
    await emitObjectStateChangedToInterested(io, roomId, { objectId, state: next }, roomState.users);
    socket.emit('user-moved', {
      userId,
      x: position.x,
      y: position.y,
      direction: Direction.SE,
      state: 'sit' as AvatarState,
    });
    await emitPoseChangeWithInterest(io, socket, roomId, userId, previous, {
      x: position.x,
      y: position.y,
      direction: Direction.SE,
      state: 'sit' as AvatarState,
    });
    return true;
  }

  if (action === 'seat-leave') {
    if (occupiedBy && occupiedBy !== userId) return true;

    const position = seatPositionFrom(payload) ?? seatPositionFrom(current);
    const next: ObjectState = {
      ...current,
      kind: 'seat',
      occupiedBy: null,
      updatedAt: now,
    };

    await state.updateObjectState(roomId, objectId, next);
    if (position) {
      const roomState = await state.getRoomState(roomId);
      const previous = roomState.users.find((user) => user.userId === userId)?.position ?? position;
      await state.updatePose(roomId, userId, position, 'idle');
      await persistUserPosition(userId, roomId, position);
      socket.emit('user-moved', {
        userId,
        x: position.x,
        y: position.y,
        direction: Direction.SE,
        state: 'idle' as AvatarState,
      });
      await emitPoseChangeWithInterest(io, socket, roomId, userId, previous, {
        x: position.x,
        y: position.y,
        direction: Direction.SE,
        state: 'idle' as AvatarState,
      });
    } else {
      await state.updateAvatarState(roomId, userId, 'idle');
    }
    await emitObjectStateChangedToInterested(io, roomId, { objectId, state: next });
    return true;
  }

  socket.emit('error', { code: 'UNKNOWN_INTERACTION', message: 'Azione seduta sconosciuta' });
  return true;
}
