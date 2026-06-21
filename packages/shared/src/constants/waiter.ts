import type { HeldItem } from '../types/events';

export const WAITER_OBJECT_ID = 'waiter:bar';

export const ORDER_ITEMS = [
  { id: 'beer', label: 'Birra' },
  { id: 'pretzel', label: 'Pretzel' },
] as const;

export type OrderItemId = Extract<HeldItem, 'beer' | 'pretzel'>;
export type WaiterPhase =
  | 'idle'
  | 'approaching'
  | 'awaiting-order'
  | 'to-counter'
  | 'delivering'
  | 'delivered'
  | 'returning';

export interface WaiterState {
  kind: 'waiter';
  phase: WaiterPhase;
  x: number;
  y: number;
  targetX?: number;
  targetY?: number;
  customerId?: string;
  customerName?: string;
  orderId?: string;
  item?: OrderItemId;
  updatedAt: number;
}

const ORDER_ITEM_IDS = new Set<string>(ORDER_ITEMS.map((item) => item.id));

export function isOrderItemId(value: unknown): value is OrderItemId {
  return typeof value === 'string' && ORDER_ITEM_IDS.has(value);
}

export function orderItemLabel(itemId: OrderItemId): string {
  return ORDER_ITEMS.find((item) => item.id === itemId)?.label ?? itemId;
}

export function defaultWaiterState(now = Date.now()): WaiterState {
  return {
    kind: 'waiter',
    phase: 'idle',
    x: 2,
    y: 1,
    updatedAt: now,
  };
}

function numberOrUndefined(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

export function normalizeWaiterState(value: unknown, now = Date.now()): WaiterState {
  const raw = value && typeof value === 'object' ? value as Partial<WaiterState> : {};
  const fallback = defaultWaiterState(now);
  const phase: WaiterPhase = (
    raw.phase === 'approaching' ||
    raw.phase === 'awaiting-order' ||
    raw.phase === 'to-counter' ||
    raw.phase === 'delivering' ||
    raw.phase === 'delivered' ||
    raw.phase === 'returning'
  ) ? raw.phase : 'idle';

  return {
    kind: 'waiter',
    phase,
    x: numberOrUndefined(raw.x) ?? fallback.x,
    y: numberOrUndefined(raw.y) ?? fallback.y,
    targetX: numberOrUndefined(raw.targetX),
    targetY: numberOrUndefined(raw.targetY),
    customerId: typeof raw.customerId === 'string' ? raw.customerId : undefined,
    customerName: typeof raw.customerName === 'string' ? raw.customerName : undefined,
    orderId: typeof raw.orderId === 'string' ? raw.orderId : undefined,
    item: isOrderItemId(raw.item) ? raw.item : undefined,
    updatedAt: numberOrUndefined(raw.updatedAt) ?? now,
  };
}
