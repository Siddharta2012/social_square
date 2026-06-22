import {
  isWithinInteractionRange,
  petalPointKey,
  petalSpawnConfigForLocation,
} from '@social-square/shared';
import { logInfo, logWarn } from '../../utils/logger';
import { economyEvent } from '../../utils/metrics';
import { socketRateLimiter } from '../../utils/rateLimit';
import { state, userService, type IoSocket } from './roomContext';
import {
  currentRoomUserForInteraction,
  isSafeEventText,
  locationIdFor,
  socketRateKey,
} from './roomUtils';
import type { ObjectState } from '@social-square/shared';

const PETAL_SERVER_COLLECT_RADIUS_TILES = 1.6;

export async function handlePetalInteraction(
  socket: IoSocket,
  roomId: string,
  userId: string,
  action: string,
  payload: ObjectState,
): Promise<void> {
  const requestId = isSafeEventText(payload.requestId, 80) ? payload.requestId : undefined;
  const emitPetalError = (code: string, message: string) => {
    socket.emit('error', { code, message, requestId });
  };

  const petalRate = await socketRateLimiter.hitShared(socketRateKey(socket, 'petal'), 16, 10_000);
  if (!petalRate.allowed) {
    emitPetalError('PETAL_RATE_LIMIT', 'Troppi petali troppo in fretta, rallenta un attimo');
    logWarn('socket.rate_limited', {
      bucket: 'petal',
      userId,
      socketId: socket.id,
      retryAfterMs: petalRate.retryAfterMs,
    });
    return;
  }
  if (action !== 'petal-collect') {
    emitPetalError('UNKNOWN_INTERACTION', 'Azione petali sconosciuta');
    return;
  }

  const x = typeof payload.x === 'number' ? payload.x : NaN;
  const y = typeof payload.y === 'number' ? payload.y : NaN;
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    emitPetalError('INVALID_PETAL', 'Petali non validi');
    return;
  }

  const roomUser = await currentRoomUserForInteraction(roomId, userId, payload);
  if (!roomUser) return;
  const locationId = locationIdFor(roomUser.position);
  const config = petalSpawnConfigForLocation(locationId);
  const point = config?.points.find(
    (candidate) =>
      Math.round(candidate.x) === Math.round(x) && Math.round(candidate.y) === Math.round(y),
  );
  if (!config || !point) {
    emitPetalError('INVALID_PETAL', 'Fiore non disponibile qui');
    return;
  }
  if (!isWithinInteractionRange(roomUser.position, point, PETAL_SERVER_COLLECT_RADIUS_TILES)) {
    emitPetalError('TOO_FAR', 'Avvicinati ai petali');
    return;
  }

  const pointKey = petalPointKey(point);
  const reserved = await state.reservePetalCollect(userId, locationId, pointKey, config.intervalMs);
  if (!reserved) {
    emitPetalError('PETAL_COOLDOWN', 'Questo fiore deve ricrescere');
    return;
  }

  const nextUser = await userService.awardPetals(
    userId,
    config.value,
    'flower',
    requestId ? `petal:${requestId}` : `petal:${userId}:${locationId}:${pointKey}:${Date.now()}`,
  );
  if (!nextUser) return;
  const progressUpdate = await userService.recordProgressActivity(userId, 'petal');
  const accountUser = progressUpdate?.user ?? nextUser;
  socket.emit('petals-collected', {
    amount: config.value,
    petals: accountUser.petals,
    position: point,
    source: 'flower',
    requestId,
  });
  socket.emit('account-updated', {
    stats: { ...accountUser.stats },
    progress: progressUpdate?.progress,
  });
  economyEvent();
  logInfo('economy.award', {
    userId,
    source: 'flower',
    amount: config.value,
    petals: accountUser.petals,
    locationId,
  });
}
