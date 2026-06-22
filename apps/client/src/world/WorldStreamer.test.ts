import { describe, expect, it, vi } from 'vitest';
import { SectorLoader, type SectorRegistry } from './SectorLoader';
import { WorldMap } from './WorldMap';
import { WorldStreamer } from './WorldStreamer';
import { SECTOR_SIZE, type SectorData } from './types';

function emptySector(sx: number, sy: number): SectorData {
  return { sx, sy, tiles: [] };
}

function registryForAll(): SectorRegistry {
  return new Proxy({}, {
    get: (_target, key: string) => {
      const [sx, sy] = key.split(',').map(Number);
      return () => Promise.resolve({ sector: emptySector(sx, sy) });
    },
  }) as SectorRegistry;
}

describe('WorldStreamer', () => {
  it('loads only the current screen-sized location', async () => {
    const map = new WorldMap();
    const loader = new SectorLoader(registryForAll());
    const ready = vi.fn();
    const streamer = new WorldStreamer(map, loader, { onSectorReady: ready });

    await streamer.update(0, 0);
    expect(ready).toHaveBeenCalledTimes(1);
    expect(map.hasSector(0, 0)).toBe(true);
    expect(map.hasSector(1, 1)).toBe(false);
    expect(map.hasSector(-1, -1)).toBe(false);
  });

  it('unloads the previous location when the player changes screen', async () => {
    const map = new WorldMap();
    const loader = new SectorLoader(registryForAll());
    const unloaded = vi.fn();
    const streamer = new WorldStreamer(map, loader, { onSectorUnload: unloaded });

    await streamer.update(0, 0);
    await streamer.update(SECTOR_SIZE * 3, 0);

    expect(map.hasSector(0, 0)).toBe(false);
    expect(map.hasSector(3, 0)).toBe(true);
    expect(unloaded).toHaveBeenCalled();
  });

  it('fires loading state callbacks', async () => {
    const map = new WorldMap();
    const loader = new SectorLoader(registryForAll());
    const states: Array<string | null> = [];
    const streamer = new WorldStreamer(map, loader, {
      onLoadingChange: (state) => states.push(state),
    });

    await streamer.update(0, 0);
    expect(states[0]).toBe('initial');
    expect(states[states.length - 1]).toBeNull();
  });
});
