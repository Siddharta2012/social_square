import {
  JUKEBOX_PLAY_COST,
  JUKEBOX_PLAY_DURATION_MS,
  JUKEBOX_POSITION,
  isJukeboxTrackId,
  jukeboxTitle,
  nextJukeboxTrackId,
  normalizeJukeboxState,
  parseJukeboxExternalTrack,
} from '@social-square/shared';
import { logInfo } from '../../utils/logger';
import { economyEvent } from '../../utils/metrics';
import { emitObjectStateChangedToInterested } from './interestBroadcaster';
import { state, userService, type IoServer, type IoSocket } from './roomContext';
import { ensureUserNear, isSafeEventText } from './roomUtils';
import type { JukeboxState, ObjectState } from '@social-square/shared';

function isActiveJukebox(
  state: ReturnType<typeof normalizeJukeboxState>,
  now = Date.now(),
): boolean {
  return state.playing && (state.expiresAt === null || state.expiresAt > now);
}

function withJukeboxHistory(next: JukeboxState, requester: string, now: number): JukeboxState {
  const title = next.externalTrack?.title ?? jukeboxTitle(next.trackId);
  const source: 'local' | 'youtube' = next.externalTrack?.provider ?? 'local';
  return {
    ...next,
    history: [
      {
        trackId: next.trackId,
        title,
        source,
        requestedBy: requester,
        startedAt: now,
      },
      ...(next.history ?? []),
    ].slice(0, 8),
  };
}

export async function handleJukeboxInteraction(
  io: IoServer,
  socket: IoSocket,
  roomId: string,
  userId: string,
  username: string,
  objectId: string,
  action: string,
  payload: ObjectState,
): Promise<void> {
  const listener = await ensureUserNear(
    socket,
    roomId,
    userId,
    JUKEBOX_POSITION,
    'Avvicinati al jukebox',
    payload,
  );
  if (!listener) return;

  const now = Date.now();
  const current = normalizeJukeboxState(await state.getObjectState(roomId, objectId), now);
  const requestId = isSafeEventText(payload.requestId, 80) ? payload.requestId : undefined;
  let next = current;

  if (isActiveJukebox(current, now)) {
    socket.emit('error', { code: 'JUKEBOX_LOCKED', message: 'Il jukebox e gia in corso' });
    return;
  }

  let requiresPayment = false;
  if (action === 'jukebox-toggle') {
    next = {
      ...current,
      playing: true,
      startedAt: now,
      expiresAt: now + JUKEBOX_PLAY_DURATION_MS,
      updatedAt: now,
      requestedBy: username,
    };
    requiresPayment = true;
  } else if (action === 'jukebox-next') {
    next = {
      ...current,
      trackId: nextJukeboxTrackId(current.trackId),
      externalTrack: undefined,
      playing: true,
      startedAt: now,
      expiresAt: now + JUKEBOX_PLAY_DURATION_MS,
      updatedAt: now,
      requestedBy: username,
    };
    requiresPayment = true;
  } else if (action === 'jukebox-play-track') {
    const trackId = isJukeboxTrackId(payload.trackId) ? payload.trackId : current.trackId;
    next = {
      ...current,
      trackId,
      externalTrack: undefined,
      playing: true,
      startedAt: now,
      expiresAt: now + JUKEBOX_PLAY_DURATION_MS,
      updatedAt: now,
      requestedBy: username,
    };
    requiresPayment = true;
  } else if (action === 'jukebox-play-url') {
    const externalTrack = parseJukeboxExternalTrack(payload.url);
    if (!externalTrack) {
      socket.emit('error', { code: 'INVALID_MEDIA_URL', message: 'Link YouTube non valido' });
      return;
    }
    next = {
      ...current,
      externalTrack,
      playing: true,
      startedAt: now,
      expiresAt: now + JUKEBOX_PLAY_DURATION_MS,
      updatedAt: now,
      requestedBy: username,
    };
    requiresPayment = true;
  } else if (action === 'jukebox-stop') {
    socket.emit('error', { code: 'JUKEBOX_LOCKED', message: 'Il jukebox non si puo interrompere' });
    return;
  } else {
    socket.emit('error', { code: 'UNKNOWN_INTERACTION', message: 'Azione jukebox sconosciuta' });
    return;
  }

  if (requiresPayment) {
    const paidUser = await userService.spendPetals(
      userId,
      JUKEBOX_PLAY_COST,
      'jukebox',
      requestId ? `jukebox:${requestId}` : undefined,
    );
    if (!paidUser) {
      socket.emit('error', {
        code: 'INSUFFICIENT_PETALS',
        message: `Servono ${JUKEBOX_PLAY_COST} petali`,
      });
      return;
    }
    socket.emit('account-updated', { petals: paidUser.petals, stats: { ...paidUser.stats } });
    next = withJukeboxHistory(next, username, now);
    economyEvent();
    logInfo('economy.spend', {
      userId,
      source: 'jukebox',
      amount: JUKEBOX_PLAY_COST,
      petals: paidUser.petals,
    });
  }

  await state.updateObjectState(roomId, objectId, next as unknown as ObjectState);
  await emitObjectStateChangedToInterested(io, roomId, {
    objectId,
    state: next as unknown as ObjectState,
  });
}
