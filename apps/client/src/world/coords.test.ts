import { describe, expect, it } from 'vitest';
import { computeActiveSet, globalToSector, sectorKey, toLocal } from './coords';

describe('coords', () => {
  it('builds a stable sector key', () => {
    expect(sectorKey(0, 0)).toBe('0,0');
    expect(sectorKey(-1, 2)).toBe('-1,2');
  });

  it('maps global tile coords to sector index', () => {
    expect(globalToSector(0)).toBe(0);
    expect(globalToSector(23)).toBe(0);
    expect(globalToSector(24)).toBe(1);
    expect(globalToSector(-1)).toBe(-1);
  });

  it('maps global tile coords to local coords', () => {
    expect(toLocal(0)).toBe(0);
    expect(toLocal(23)).toBe(23);
    expect(toLocal(24)).toBe(0);
    expect(toLocal(-1)).toBe(23);
  });

  it('computes the 3x3 active set around a center sector', () => {
    const set = computeActiveSet(0, 0, 1).sort();
    expect(set).toEqual(
      ['-1,-1', '-1,0', '-1,1', '0,-1', '0,0', '0,1', '1,-1', '1,0', '1,1'].sort(),
    );
    expect(set).toHaveLength(9);
  });
});
