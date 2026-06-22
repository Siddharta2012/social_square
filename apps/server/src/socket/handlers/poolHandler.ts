import { randomUUID } from 'node:crypto';
import {
  POOL_OBJECT_ID,
  POOL_PLAY_COST,
  POOL_PLAY_DURATION_MS,
  POOL_POSITION,
  newlyPottedPoolBalls,
  normalizePoolState,
  parsePoolBalls,
  poolStateToObjectState,
  resolvePoolShot,
  simulatePoolShot,
} from '@social-square/shared';
import { logInfo } from '../../utils/logger';
import { economyEvent } from '../../utils/metrics';
import { emitObjectStateChangedToInterested } from './interestBroadcaster';
import { state, userService, type IoServer, type IoSocket } from './roomContext';
import { ensureUserNear, isSafeEventText, locationIdFor } from './roomUtils';
import type { ObjectState, PoolState } from '@social-square/shared';

function poolPlayer(state: PoolState, userId: string): PoolState['players'][number] | undefined {
  return state.players.find((player) => player.userId === userId);
}

function poolIsExpired(state: PoolState, now = Date.now()): boolean {
  return (state.phase === 'waiting' || state.phase === 'playing') &&
    typeof state.expiresAt === 'number' &&
    state.expiresAt <= now;
}

function expiredPoolState(now = Date.now()): PoolState {
  return {
    ...normalizePoolState(null, now),
    phase: 'finished',
    message: 'Tempo biliardo scaduto',
    updatedAt: now,
  };
}

export function validatePoolSyncHint(
  current: PoolState,
  userId: string,
  payload: ObjectState,
): { ok: boolean; code?: string; message?: string } {
  if (current.phase !== 'playing' || !poolPlayer(current, userId)) return { ok: false };
  if (current.turnUserId && current.turnUserId !== userId) {
    return { ok: false, code: 'POOL_NOT_YOUR_TURN', message: 'Non e il tuo turno' };
  }
  if (!current.lastShot || current.lastShot.userId !== userId) {
    return { ok: false, code: 'POOL_SYNC_REJECTED', message: 'Sync biliardo fuori sequenza' };
  }
  const balls = parsePoolBalls(payload.balls);
  if (!balls) return { ok: false, code: 'INVALID_POOL_SYNC', message: 'Sync biliardo non valido' };
  if (newlyPottedPoolBalls(current.balls, balls) > current.rules.maxPottedPerShot) {
    return { ok: false, code: 'POOL_SYNC_REJECTED', message: 'Stato biliardo non plausibile' };
  }
  return { ok: true };
}

export async function emitPoolState(io: IoServer, roomId: string, nextState: PoolState): Promise<void> {
  const objectState = poolStateToObjectState(nextState);
  await state.updateObjectState(roomId, POOL_OBJECT_ID, objectState);
  await emitObjectStateChangedToInterested(io, roomId, { objectId: POOL_OBJECT_ID, state: objectState });
}

export async function removePoolPlayer(io: IoServer, roomId: string, userId: string): Promise<void> {
  const poolState = normalizePoolState(await state.getObjectState(roomId, POOL_OBJECT_ID));
  const poolPlayers = poolState.players.filter((player) => player.userId !== userId);
  if (poolPlayers.length === poolState.players.length) return;
  const nextPool = poolPlayers.length === 0
    ? normalizePoolState(null)
    : {
        ...poolState,
        phase: poolState.mode === 'duo' && poolPlayers.length === 1 ? 'waiting' as const : poolState.phase,
        players: poolPlayers,
        turnUserId: poolPlayers[0]?.userId,
        updatedAt: Date.now(),
      };
  await emitPoolState(io, roomId, nextPool);
}

export async function handlePoolInteraction(
  io: IoServer,
  socket: IoSocket,
  roomId: string,
  userId: string,
  username: string,
  objectId: string,
  action: string,
  payload: ObjectState,
): Promise<void> {
  const requestId = isSafeEventText(payload.requestId, 80) ? payload.requestId : undefined;
  const emitPoolError = (code: string, message: string) => {
    socket.emit('error', { code, message, requestId });
  };
  const player = await ensureUserNear(
    socket,
    roomId,
    userId,
    POOL_POSITION,
    'Avvicinati al biliardo',
  );
  if (!player) return;
  if (locationIdFor(player.position) !== '0,0') {
    emitPoolError('WRONG_LOCATION', 'Il biliardo e nel bar');
    return;
  }

  const now = Date.now();
  let current = normalizePoolState(await state.getObjectState(roomId, objectId), now);
  if (poolIsExpired(current, now)) {
    const expired = expiredPoolState(now);
    await emitPoolState(io, roomId, expired);
    current = expired;
    if (action !== 'pool-start-solo' && action !== 'pool-create-duo') {
      emitPoolError('POOL_EXPIRED', 'Tempo biliardo scaduto');
      return;
    }
  }

  if (action === 'pool-start-solo' || action === 'pool-create-duo' || action === 'pool-join-duo') {
    if (current.phase === 'finished' && action !== 'pool-join-duo') {
      current = normalizePoolState(null, now);
    }
    if (poolPlayer(current, userId)) {
      emitPoolError('POOL_ALREADY_JOINED', 'Sei gia al tavolo');
      return;
    }
    if (action !== 'pool-join-duo' && (current.phase === 'playing' || current.phase === 'waiting')) {
      emitPoolError('POOL_BUSY', 'Il biliardo e gia occupato');
      return;
    }
    if (action === 'pool-join-duo' && (current.phase !== 'waiting' || current.mode !== 'duo' || current.players.length !== 1)) {
      emitPoolError('POOL_NOT_WAITING', 'Nessuna partita a due in attesa');
      return;
    }

    const paidUser = await userService.spendPetals(
      userId,
      POOL_PLAY_COST,
      'pool',
      requestId ? `pool:${requestId}` : undefined,
    );
    if (!paidUser) {
      emitPoolError('INSUFFICIENT_PETALS', `Servono ${POOL_PLAY_COST} petali`);
      return;
    }
    socket.emit('account-updated', { petals: paidUser.petals, stats: { ...paidUser.stats } });
    economyEvent();
    logInfo('economy.spend', { userId, source: 'pool', amount: POOL_PLAY_COST, petals: paidUser.petals });

    const joining = { userId, username, joinedAt: now };
    const sessionExpiresAt = now + POOL_PLAY_DURATION_MS;
    const next: PoolState = action === 'pool-start-solo'
      ? {
          ...normalizePoolState(null, now),
          phase: 'playing',
          mode: 'solo',
          players: [joining],
          startedAt: now,
          expiresAt: sessionExpiresAt,
          turnUserId: userId,
          message: `${username} gioca da solo`,
          updatedAt: now,
        }
      : action === 'pool-create-duo'
        ? {
            ...normalizePoolState(null, now),
            phase: 'waiting',
            mode: 'duo',
            players: [joining],
            startedAt: now,
            expiresAt: sessionExpiresAt,
            turnUserId: userId,
            message: `${username} aspetta un avversario`,
            updatedAt: now,
          }
        : {
            ...current,
            phase: 'playing',
            mode: 'duo',
            players: [...current.players, joining],
            startedAt: now,
            expiresAt: sessionExpiresAt,
            turnUserId: current.players[0]?.userId ?? userId,
            message: `${username} entra al tavolo`,
            updatedAt: now,
          };

    await emitPoolState(io, roomId, next);
    return;
  }

  if (action === 'pool-shot') {
    if (current.phase !== 'playing' || !poolPlayer(current, userId)) {
      emitPoolError('POOL_NOT_PLAYING', 'Non sei in questa partita');
      return;
    }
    if (current.turnUserId && current.turnUserId !== userId) {
      emitPoolError('POOL_NOT_YOUR_TURN', 'Non e il tuo turno');
      return;
    }

    const angle = typeof payload.angle === 'number' && Number.isFinite(payload.angle) ? payload.angle : NaN;
    const power = typeof payload.power === 'number' && Number.isFinite(payload.power) ? payload.power : NaN;
    const spin = typeof payload.spin === 'number' && Number.isFinite(payload.spin) ? payload.spin : 0;
    if (!Number.isFinite(angle) || !Number.isFinite(power)) {
      emitPoolError('INVALID_POOL_SHOT', 'Tiro non valido');
      return;
    }

    const shot = {
      shotId: randomUUID(),
      userId,
      angle: Math.max(-Math.PI * 2, Math.min(Math.PI * 2, angle)),
      power: Math.max(0, Math.min(1, power)),
      spin: Math.max(-1, Math.min(1, spin)),
      createdAt: now,
    };
    const simulation = simulatePoolShot(current.balls, shot);
    if (newlyPottedPoolBalls(current.balls, simulation.balls) > current.rules.maxPottedPerShot) {
      emitPoolError('POOL_SYNC_REJECTED', 'Stato biliardo non plausibile');
      return;
    }
    const resolution = resolvePoolShot(current, userId, simulation.balls, simulation.scratched);

    const next: PoolState = {
      ...current,
      phase: resolution.finished ? 'finished' : current.phase,
      balls: simulation.balls,
      turnUserId: resolution.nextTurnUserId,
      winnerUserId: resolution.winnerUserId,
      scores: resolution.scores,
      fouls: resolution.fouls,
      lastShot: shot,
      lastOutcome: resolution.outcome,
      breakResolved: resolution.breakResolved,
      ballInHandUserId: resolution.ballInHandUserId,
      message: resolution.message,
      updatedAt: now,
    };
    await emitPoolState(io, roomId, next);
    return;
  }

  if (action === 'pool-place-cue') {
    if (current.phase !== 'playing' || current.ballInHandUserId !== userId) {
      emitPoolError('POOL_CUE_LOCKED', 'Non puoi piazzare la battente ora');
      return;
    }
    const cueX = typeof payload.x === 'number' && Number.isFinite(payload.x) ? payload.x : NaN;
    const cueY = typeof payload.y === 'number' && Number.isFinite(payload.y) ? payload.y : NaN;
    if (!Number.isFinite(cueX) || !Number.isFinite(cueY)) {
      emitPoolError('INVALID_POOL_CUE', 'Posizione battente non valida');
      return;
    }
    const balls = current.balls.map((ball) => (ball.id === 'cue'
      ? {
          ...ball,
          x: Math.max(0.12, Math.min(0.88, cueX)),
          y: Math.max(0.14, Math.min(0.86, cueY)),
          vx: 0,
          vy: 0,
          pocketed: false,
          spin: 0,
        }
      : ball));
    await emitPoolState(io, roomId, {
      ...current,
      balls,
      ballInHandUserId: undefined,
      message: `${username} piazza la battente`,
      updatedAt: now,
    });
    return;
  }

  if (action === 'pool-sync') {
    const hint = validatePoolSyncHint(current, userId, payload);
    if (hint.code && hint.message) emitPoolError(hint.code, hint.message);
    return;
  }

  if (action === 'pool-leave') {
    if (!poolPlayer(current, userId)) return;
    const remaining = current.players.filter((entry) => entry.userId !== userId);
    const next: PoolState = remaining.length === 0
      ? normalizePoolState(null, now)
      : {
          ...current,
          phase: current.mode === 'duo' && remaining.length === 1 ? 'waiting' : current.phase,
          players: remaining,
          turnUserId: remaining[0]?.userId,
          message: `${username} lascia il tavolo`,
          updatedAt: now,
        };
    await emitPoolState(io, roomId, next);
    return;
  }

  emitPoolError('UNKNOWN_INTERACTION', 'Azione biliardo sconosciuta');
}
