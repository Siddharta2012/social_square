import { describe, expect, it } from 'vitest';
import {
  JUKEBOX_OBJECT_ID,
  WAITER_OBJECT_ID,
  filterObjectsByInterest,
  filterUsersByInterest,
  isObjectVisibleToViewer,
  objectInterestScope,
  isPositionInInterestRange,
  objectInterestPosition,
  positionToSector,
  sectorDistance,
} from '@social-square/shared';

describe('interest management helpers', () => {
  it('maps world positions to sector coordinates', () => {
    expect(positionToSector({ x: 0, y: 0 })).toEqual({ sx: 0, sy: 0 });
    expect(positionToSector({ x: 23, y: 23 })).toEqual({ sx: 0, sy: 0 });
    expect(positionToSector({ x: 24, y: 0 })).toEqual({ sx: 1, sy: 0 });
    expect(positionToSector({ x: -1, y: 0 })).toEqual({ sx: -1, sy: 0 });
  });

  it('uses Chebyshev distance for sector rings', () => {
    expect(sectorDistance({ sx: 0, sy: 0 }, { sx: 1, sy: 1 })).toBe(1);
    expect(sectorDistance({ sx: 0, sy: 0 }, { sx: 2, sy: 1 })).toBe(2);
  });

  it('matches positions only in the current location sector by default', () => {
    expect(isPositionInInterestRange({ x: 9, y: 14 }, { x: 10, y: 16 })).toBe(true);
    expect(isPositionInInterestRange({ x: 9, y: 14 }, { x: 34, y: 25 })).toBe(false);
    expect(isPositionInInterestRange({ x: 9, y: 14 }, { x: 60, y: 14 })).toBe(false);
  });

  it('filters visible users while preserving the viewer', () => {
    const viewer = { userId: 'a', position: { x: 9, y: 14 } };
    const nearby = { userId: 'b', position: { x: 10, y: 16 } };
    const far = { userId: 'c', position: { x: 70, y: 14 } };

    expect(filterUsersByInterest(viewer, [far, nearby, viewer])).toEqual([nearby, viewer]);
  });

  it('resolves known object positions for sector interest checks', () => {
    expect(objectInterestPosition({ objectId: 'seat:garden-bench-west', state: {} })).toEqual({ x: 7, y: 32 });
    expect(objectInterestPosition({ objectId: JUKEBOX_OBJECT_ID, state: {} })).toEqual({ x: 16, y: 3 });
    expect(objectInterestPosition({
      objectId: WAITER_OBJECT_ID,
      state: { kind: 'waiter', phase: 'approaching', x: 70, y: 14, updatedAt: 1000 },
    })).toEqual({ x: 70, y: 14 });
  });

  it('filters positioned object state by viewer interest', () => {
    const viewer = { userId: 'viewer', position: { x: 60, y: 14 } };
    const nearbyObject = { objectId: 'notice:near', state: { x: 60, y: 14 } };
    const farSeat = { objectId: 'seat:table-west', state: { kind: 'seat' } };

    expect(filterObjectsByInterest(viewer, [farSeat, nearbyObject])).toEqual([nearbyObject]);
  });

  it('keeps jukebox state scoped to the bar interior location', () => {
    const barViewer = { userId: 'bar', position: { x: 9, y: 14 } };
    const gardenViewer = { userId: 'garden', position: { x: 9, y: 30 } };
    const jukebox = { objectId: JUKEBOX_OBJECT_ID, state: { playing: true } };

    expect(isObjectVisibleToViewer(barViewer, jukebox)).toBe(true);
    expect(isObjectVisibleToViewer(gardenViewer, jukebox)).toBe(false);
  });

  it('scopes waiter state to the location unless it is personal', () => {
    const viewer = { userId: 'bystander', position: { x: 9, y: 14 } };
    const waiter = {
      objectId: WAITER_OBJECT_ID,
      state: {
        kind: 'waiter',
        phase: 'to-counter',
        x: 70,
        y: 14,
        customerId: 'customer',
        updatedAt: 1000,
      },
    };

    expect(objectInterestScope(waiter)).toBe('personal');
    expect(isObjectVisibleToViewer(viewer, waiter)).toBe(false);
    expect(isObjectVisibleToViewer({ userId: 'customer', position: { x: 9, y: 14 } }, waiter)).toBe(true);
  });
});
