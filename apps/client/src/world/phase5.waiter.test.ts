import {
  ORDER_ITEMS,
  WAITER_OBJECT_ID,
  defaultWaiterState,
  isOrderItemId,
  normalizeWaiterState,
  orderItemLabel,
} from '@social-square/shared';
import { describe, expect, it } from 'vitest';

describe('phase 5 waiter bot data', () => {
  it('defines a stable waiter object and supported order items', () => {
    expect(WAITER_OBJECT_ID).toBe('waiter:bar');
    expect(ORDER_ITEMS.map((item) => item.id)).toEqual(['beer', 'pretzel']);
    expect(isOrderItemId('beer')).toBe(true);
    expect(isOrderItemId('pretzel')).toBe(true);
    expect(isOrderItemId('coffee')).toBe(false);
    expect(orderItemLabel('beer')).toBe('Birra');
  });

  it('normalizes waiter state with safe defaults', () => {
    expect(defaultWaiterState(1000)).toEqual({
      kind: 'waiter',
      phase: 'idle',
      x: 2,
      y: 1,
      updatedAt: 1000,
    });

    expect(normalizeWaiterState({
      phase: 'delivering',
      x: 4,
      y: 5,
      targetX: 9,
      targetY: 14,
      item: 'pretzel',
      customerId: 'u-1',
      updatedAt: 2000,
    })).toMatchObject({
      kind: 'waiter',
      phase: 'delivering',
      x: 4,
      y: 5,
      targetX: 9,
      targetY: 14,
      item: 'pretzel',
      customerId: 'u-1',
      updatedAt: 2000,
    });
  });
});
