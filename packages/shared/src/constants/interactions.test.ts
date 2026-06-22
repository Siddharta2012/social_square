import { describe, expect, it } from 'vitest';
import { isWithinInteractionRange, petalPointKey, petalSpawnConfigForLocation } from './interactions';

describe('interaction helpers', () => {
  it('checks finite tile distance', () => {
    expect(isWithinInteractionRange({ x: 0, y: 0 }, { x: 3, y: 0 }, 3)).toBe(true);
    expect(isWithinInteractionRange({ x: 0, y: 0 }, { x: 3.1, y: 0 }, 3)).toBe(false);
    expect(isWithinInteractionRange({ x: Number.NaN, y: 0 }, { x: 0, y: 0 }, 3)).toBe(false);
  });

  it('normalizes petal point keys by rounded tile', () => {
    expect(petalPointKey({ x: 3.49, y: 7.5 })).toBe('3,8');
    expect(petalSpawnConfigForLocation('0,1')?.points.length).toBeGreaterThan(0);
  });
});
