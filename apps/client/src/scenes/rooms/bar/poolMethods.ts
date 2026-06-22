import {
  Direction,
  POOL_OBJECT_ID,
  POOL_PLAY_COST,
  POOL_POSITION,
  normalizePoolState,
  serializePoolBalls,
} from '@social-square/shared';
import { t } from '../../../i18n';
import { useGameStore } from '../../../store/gameStore';
import type { PoolBall } from '@social-square/shared';

function requestId(prefix: string): string {
  return `${prefix}:${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}:${Math.random().toString(36).slice(2)}`}`;
}

export function requestPoolOpen(this: any): void {
  if (!this._isInPoolLocation()) {
    this._showPoolMessage(t('pool.available'), 'error');
    return;
  }
  if (!this._isNear(POOL_POSITION)) {
    this._showPoolMessage(t('pool.near'), 'error');
    return;
  }
  const store = useGameStore.getState();
  this.movementSystem.stopMovement();
  store.setPoolMessage(null);
  store.setShowPoolOverlay(true);
}

export function requestPoolStart(
  this: any,
  action: 'pool-start-solo' | 'pool-create-duo' | 'pool-join-duo',
): void {
  if (!this._isInPoolLocation()) {
    this._showPoolMessage(t('pool.available'), 'error');
    return;
  }
  if (!this._isNear(POOL_POSITION)) {
    this._showPoolMessage(t('pool.near'), 'error');
    return;
  }
  const store = useGameStore.getState();
  if (store.petals < POOL_PLAY_COST) {
    this._showPoolMessage(t('common.petalsRequired', { cost: POOL_PLAY_COST }), 'error');
    return;
  }
  store.setPoolMessage({ text: t('pool.pending'), tone: 'info' });
  const local = this._syncPoolPositionForServer();
  this._network?.emitInteract(POOL_OBJECT_ID, action, {
    requestId: requestId(action),
    ...(local ? { playerX: local.x, playerY: local.y } : {}),
  });
}

export function requestPoolShot(this: any, shot: { angle: number; power: number; spin?: number }): void {
  this._network?.emitInteract(POOL_OBJECT_ID, 'pool-shot', {
    angle: shot.angle,
    power: shot.power,
    spin: shot.spin ?? 0,
    requestId: requestId('pool-shot'),
  });
}

export function requestPoolSync(this: any, payload: { balls: PoolBall[]; scratched: boolean }): void {
  this._network?.emitInteract(POOL_OBJECT_ID, 'pool-sync', {
    balls: serializePoolBalls(payload.balls),
    scratched: payload.scratched,
    requestId: requestId('pool-sync'),
  });
}

export function requestPoolPlaceCue(this: any, payload: { x: number; y: number }): void {
  this._network?.emitInteract(POOL_OBJECT_ID, 'pool-place-cue', {
    ...payload,
    requestId: requestId('pool-place-cue'),
  });
}

export function requestPoolLeave(this: any): void {
  this._network?.emitInteract(POOL_OBJECT_ID, 'pool-leave');
  const store = useGameStore.getState();
  store.setPoolMessage(null);
  store.setShowPoolOverlay(false);
}

export function applyPoolState(this: any, rawState: unknown): void {
  const state = normalizePoolState(rawState);
  this._poolState = state;
  const store = useGameStore.getState();
  if (!this._isInPoolLocation()) {
    store.setPoolStatus(null);
    store.setShowPoolOverlay(false);
    store.setPoolMessage(null);
    return;
  }
  store.setPoolStatus(state);
  if (state.players.some((player) => player.userId === this._myUserId) && state.phase !== 'idle') {
    this.movementSystem.stopMovement();
    store.setShowPoolOverlay(true);
    if (!store.poolMessage || store.poolMessage.text === t('pool.pending')) {
      store.setPoolMessage({
        text: state.phase === 'waiting' ? t('pool.waiting') : t('pool.playing'),
        tone: 'info',
      });
    }
  }
}

export function isInPoolLocation(this: any): boolean {
  return this._currentLocationId() === '0,0';
}

export function showPoolMessage(this: any, message: string, tone: 'info' | 'error'): void {
  useGameStore.getState().setPoolMessage({ text: message, tone });
  this._showNotice(message);
}

export function syncPoolPositionForServer(this: any): { x: number; y: number } | null {
  const local = this._localPosition();
  if (!local) return null;
  this._network?.emitMove(local.x, local.y, Direction.SE, 'idle', true);
  return local;
}
