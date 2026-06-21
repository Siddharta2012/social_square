import { describe, expect, it } from 'vitest';
import { SectorLoader, type SectorRegistry } from './SectorLoader';
import type { SectorData } from './types';

function fakeSector(sx: number, sy: number): SectorData {
  return { sx, sy, tiles: [] };
}

describe('SectorLoader', () => {
  const registry: SectorRegistry = {
    '0,0': () => Promise.resolve({ sector: fakeSector(0, 0) }),
  };

  it('loads a known sector', async () => {
    const loader = new SectorLoader(registry);
    const data = await loader.load(0, 0);
    expect(data).not.toBeNull();
    expect(data?.sx).toBe(0);
  });

  it('returns null for an unknown sector', async () => {
    const loader = new SectorLoader(registry);
    expect(await loader.load(5, 5)).toBeNull();
  });
});
