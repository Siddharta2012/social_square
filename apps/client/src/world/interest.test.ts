import { describe, expect, it } from 'vitest';
import {
  filterUsersByInterest,
  isPositionInInterestRange,
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

  it('matches positions in the current sector and surrounding ring', () => {
    expect(isPositionInInterestRange({ x: 9, y: 14 }, { x: 34, y: 25 })).toBe(true);
    expect(isPositionInInterestRange({ x: 9, y: 14 }, { x: 60, y: 14 })).toBe(false);
  });

  it('filters visible users while preserving the viewer', () => {
    const viewer = { userId: 'a', position: { x: 9, y: 14 } };
    const nearby = { userId: 'b', position: { x: 35, y: 26 } };
    const far = { userId: 'c', position: { x: 70, y: 14 } };

    expect(filterUsersByInterest(viewer, [far, nearby, viewer])).toEqual([nearby, viewer]);
  });
});
