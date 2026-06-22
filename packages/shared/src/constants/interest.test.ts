import { describe, expect, it } from 'vitest';
import {
  filterObjectsByInterest,
  filterUsersByInterest,
  isPositionInInterestRange,
  objectInterestPosition,
  positionToSector,
} from './interest';
import { WAITER_OBJECT_ID } from './waiter';

describe('interest helpers', () => {
  it('maps positions to sectors and checks visibility radius', () => {
    expect(positionToSector({ x: 25, y: 47 })).toEqual({ sx: 1, sy: 1 });
    expect(isPositionInInterestRange({ x: 1, y: 1 }, { x: 8, y: 8 })).toBe(true);
    expect(isPositionInInterestRange({ x: 1, y: 1 }, { x: 30, y: 8 })).toBe(false);
  });

  it('always keeps the viewer and personal waiter state visible', () => {
    const viewer = { userId: 'a', position: { x: 1, y: 1 } };
    const users = [
      viewer,
      { userId: 'b', position: { x: 30, y: 1 } },
    ];
    const objects = [
      { objectId: WAITER_OBJECT_ID, state: { kind: 'waiter', customerId: 'a', x: 30, y: 1 } },
    ];

    expect(filterUsersByInterest(viewer, users)).toEqual([viewer]);
    expect(filterObjectsByInterest(viewer, objects)).toHaveLength(1);
    expect(objectInterestPosition(objects[0])).toEqual({ x: 30, y: 1 });
  });
});
