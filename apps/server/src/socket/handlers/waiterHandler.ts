import { randomUUID } from 'node:crypto';
import {
  PETAL_ACTION_COST,
  WAITER_OBJECT_ID,
  isOrderItemId,
  normalizeWaiterState,
} from '@social-square/shared';
import { logInfo } from '../../utils/logger';
import { economyEvent } from '../../utils/metrics';
import { emitObjectStateChangedToInterested } from './interestBroadcaster';
import { state, userService, type IoServer, type IoSocket } from './roomContext';
import { ensureUserNear, isSafeEventText } from './roomUtils';
import type { ObjectState, Position, WaiterQueueEntry, WaiterState } from '@social-square/shared';

const WAITER_HOME: Position = { x: 2, y: 1 };
const WAITER_COUNTER: Position = { x: 2, y: 0 };
const WAITER_TICK_MS = 260;
const WAITER_SPEED = 5.2;
const WAITER_BUSY_TTL_MS = 60_000;
const WAITER_QUEUE_LIMIT = 6;
const WAITER_CALL_COOLDOWN_MS = 1800;

interface WaiterRuntime {
  timers: Array<ReturnType<typeof setTimeout>>;
}

const waiterRuntimes = new Map<string, WaiterRuntime>();

function waiterRuntime(roomId: string): WaiterRuntime {
  let runtime = waiterRuntimes.get(roomId);
  if (!runtime) {
    runtime = { timers: [] };
    waiterRuntimes.set(roomId, runtime);
  }
  return runtime;
}

function clearWaiterRuntime(roomId: string): void {
  const runtime = waiterRuntimes.get(roomId);
  if (!runtime) return;
  for (const timer of runtime.timers) clearTimeout(timer);
  runtime.timers = [];
}

function scheduleWaiter(roomId: string, callback: () => void, delay: number): void {
  const runtime = waiterRuntime(roomId);
  const timer = setTimeout(() => {
    runtime.timers = runtime.timers.filter((candidate) => candidate !== timer);
    callback();
  }, delay);
  runtime.timers.push(timer);
}

async function emitWaiterState(io: IoServer, roomId: string, nextState: WaiterState): Promise<void> {
  const objectState = nextState as unknown as ObjectState;
  await state.updateObjectState(roomId, WAITER_OBJECT_ID, objectState);
  await emitObjectStateChangedToInterested(io, roomId, { objectId: WAITER_OBJECT_ID, state: objectState });
}

function isWaiterBusy(waiter: WaiterState, now: number): boolean {
  if (now - waiter.updatedAt > WAITER_BUSY_TTL_MS) return false;
  return waiter.phase !== 'idle';
}

function driveWaiterTo(
  io: IoServer,
  roomId: string,
  waiter: WaiterState,
  target: Position,
  phase: WaiterState['phase'],
  onArrive: (arrived: WaiterState) => void,
): void {
  const stepCells = (WAITER_SPEED * WAITER_TICK_MS) / 1000;
  const dx = target.x - waiter.x;
  const dy = target.y - waiter.y;
  const distance = Math.sqrt(dx * dx + dy * dy);
  const now = Date.now();

  const nextState: WaiterState = distance <= stepCells
    ? {
        ...waiter,
        phase,
        x: target.x,
        y: target.y,
        targetX: target.x,
        targetY: target.y,
        updatedAt: now,
      }
    : {
        ...waiter,
        phase,
        x: waiter.x + (dx / distance) * stepCells,
        y: waiter.y + (dy / distance) * stepCells,
        targetX: target.x,
        targetY: target.y,
        updatedAt: now,
      };

  void emitWaiterState(io, roomId, nextState).then(() => {
    if (distance <= stepCells) {
      onArrive(nextState);
      return;
    }

    scheduleWaiter(roomId, () => driveWaiterTo(io, roomId, nextState, target, phase, onArrive), WAITER_TICK_MS);
  });
}

async function startWaiterCall(
  io: IoServer,
  roomId: string,
  userId: string,
  username: string,
  target: Position,
  queue: WaiterQueueEntry[] = [],
): Promise<void> {
  clearWaiterRuntime(roomId);
  const current = normalizeWaiterState(await state.getObjectState(roomId, WAITER_OBJECT_ID));
  const now = Date.now();
  const waiter: WaiterState = {
    ...current,
    kind: 'waiter',
    phase: 'approaching',
    customerId: userId,
    customerName: username,
    targetX: target.x,
    targetY: target.y,
    item: undefined,
    orderId: undefined,
    queue: queue.length > 0 ? queue : undefined,
    cooldownUntil: now + WAITER_CALL_COOLDOWN_MS,
    updatedAt: now,
  };

  driveWaiterTo(io, roomId, waiter, target, 'approaching', (arrived) => {
    void emitWaiterState(io, roomId, {
      ...arrived,
      phase: 'awaiting-order',
      updatedAt: Date.now(),
    });
  });
}

async function finishWaiterReturn(io: IoServer, roomId: string, home: WaiterState): Promise<void> {
  const queue = home.queue ?? [];
  if (queue.length === 0) {
    await emitWaiterState(io, roomId, {
      ...home,
      phase: 'idle',
      targetX: undefined,
      targetY: undefined,
      queue: undefined,
      updatedAt: Date.now(),
    });
    return;
  }

  const [next, ...rest] = queue;
  await startWaiterCall(
    io,
    roomId,
    next.userId,
    next.username,
    { x: next.x, y: next.y },
    rest,
  );
}

function startWaiterOrder(
  io: IoServer,
  roomId: string,
  waiter: WaiterState,
  item: WaiterState['item'],
): void {
  if (!item || !waiter.customerId || waiter.targetX === undefined || waiter.targetY === undefined) return;
  clearWaiterRuntime(roomId);
  const orderId = randomUUID();
  const customerTarget = { x: waiter.targetX, y: waiter.targetY };
  const toCounter: WaiterState = {
    ...waiter,
    phase: 'to-counter',
    item,
    orderId,
    updatedAt: Date.now(),
  };

  driveWaiterTo(io, roomId, toCounter, WAITER_COUNTER, 'to-counter', (atCounter) => {
    scheduleWaiter(roomId, () => {
      const delivering: WaiterState = {
        ...atCounter,
        phase: 'delivering',
        item,
        orderId,
        updatedAt: Date.now(),
      };
      driveWaiterTo(io, roomId, delivering, customerTarget, 'delivering', (arrived) => {
        void emitWaiterState(io, roomId, {
          ...arrived,
          phase: 'delivered',
          item,
          orderId,
          updatedAt: Date.now(),
        });

        scheduleWaiter(roomId, () => {
          const returning: WaiterState = {
            ...arrived,
            phase: 'returning',
            item: undefined,
            orderId: undefined,
            customerId: undefined,
            customerName: undefined,
            updatedAt: Date.now(),
          };
          driveWaiterTo(io, roomId, returning, WAITER_HOME, 'returning', (home) => {
            void finishWaiterReturn(io, roomId, {
              ...home,
              phase: 'returning',
              targetX: undefined,
              targetY: undefined,
              updatedAt: Date.now(),
            });
          });
        }, 1800);
      });
    }, 700);
  });
}

export async function handleWaiterInteraction(
  io: IoServer,
  socket: IoSocket,
  roomId: string,
  userId: string,
  username: string,
  objectId: string,
  action: string,
  payload: ObjectState,
): Promise<void> {
  const now = Date.now();
  const current = normalizeWaiterState(await state.getObjectState(roomId, objectId), now);

  if (action === 'waiter-call') {
    const caller = await ensureUserNear(
      socket,
      roomId,
      userId,
      { x: current.x, y: current.y },
      'Avvicinati al cameriere',
    );
    if (!caller) return;

    if (current.cooldownUntil && current.cooldownUntil > now && !isWaiterBusy(current, now)) {
      socket.emit('error', { code: 'WAITER_COOLDOWN', message: 'Aspetta un attimo prima di richiamarlo' });
      return;
    }

    if (isWaiterBusy(current, now)) {
      const queue = current.queue ?? [];
      if (current.customerId === userId || queue.some((entry) => entry.userId === userId)) {
        socket.emit('error', { code: 'WAITER_ALREADY_WAITING', message: 'Sei gia in attesa del cameriere' });
        return;
      }
      if (queue.length >= WAITER_QUEUE_LIMIT) {
        socket.emit('error', { code: 'WAITER_QUEUE_FULL', message: 'La coda del cameriere e piena' });
        return;
      }

      const nextQueue: WaiterQueueEntry[] = [
        ...queue,
        {
          userId,
          username,
          x: Math.round(caller.position.x),
          y: Math.round(caller.position.y),
          requestedAt: now,
        },
      ];
      await emitWaiterState(io, roomId, {
        ...current,
        queue: nextQueue,
        updatedAt: now,
      });
      socket.emit('error', { code: 'WAITER_QUEUED', message: `Sei in coda (${nextQueue.length})` });
      return;
    }

    await startWaiterCall(io, roomId, userId, username, {
      x: Math.round(caller.position.x),
      y: Math.round(caller.position.y),
    }, current.queue ?? []);
    return;
  }

  if (action === 'waiter-order') {
    if (current.phase !== 'awaiting-order' || current.customerId !== userId) {
      socket.emit('error', { code: 'WAITER_NOT_READY', message: 'Il cameriere non e pronto per questo ordine' });
      return;
    }

    const item = isOrderItemId(payload.item) ? payload.item : null;
    const requestId = isSafeEventText(payload.requestId, 80) ? payload.requestId : undefined;
    if (!item) {
      socket.emit('error', { code: 'INVALID_ORDER_ITEM', message: 'Ordine non valido' });
      return;
    }

    const customer = await ensureUserNear(
      socket,
      roomId,
      userId,
      { x: current.x, y: current.y },
      'Avvicinati al cameriere',
    );
    if (!customer) return;

    const paidUser = await userService.spendPetals(
      userId,
      PETAL_ACTION_COST,
      'waiter',
      requestId ? `waiter:${requestId}` : undefined,
    );
    if (!paidUser) {
      socket.emit('error', { code: 'INSUFFICIENT_PETALS', message: `Servono ${PETAL_ACTION_COST} petali` });
      return;
    }
    socket.emit('account-updated', { petals: paidUser.petals, stats: { ...paidUser.stats } });
    economyEvent();
    logInfo('economy.spend', { userId, source: 'waiter', item, amount: PETAL_ACTION_COST, petals: paidUser.petals });

    startWaiterOrder(io, roomId, {
      ...current,
      targetX: Math.round(customer.position.x),
      targetY: Math.round(customer.position.y),
    }, item);
    return;
  }

  socket.emit('error', { code: 'UNKNOWN_INTERACTION', message: 'Azione cameriere sconosciuta' });
}
