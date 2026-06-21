import { describe, expect, it } from 'vitest';
import { sector as barSector } from './sectors/sector_0_0';
import { sector as gardenSector } from './sectors/sector_0_1';
import type { DecorationKind, SectorData } from './types';

function kinds(sector: SectorData): Set<DecorationKind> {
  return new Set((sector.decorations ?? []).map((decoration) => decoration.kind));
}

describe('phase 1 visual content', () => {
  it('adds rich bar fixtures and wood floor detail', () => {
    const barKinds = kinds(barSector);
    expect([...barKinds]).toEqual(expect.arrayContaining([
      'barWall',
      'barCounter',
      'bottleShelf',
      'stool',
      'table',
      'jukebox',
    ]));
    expect(barSector.tiles[1][1].detail).toBe('wood');
    expect(barSector.tiles[18][0].visible).toBe(false);
    expect(barSector.tiles[18][9].walkable).toBe(true);
    expect(barSector.tiles[18][9].visible).not.toBe(false);
    expect(barSector.decorations?.length).toBeGreaterThan(20);
  });

  it('adds garden furniture, plants, lights, and surface detail', () => {
    const gardenKinds = kinds(gardenSector);
    expect([...gardenKinds]).toEqual(expect.arrayContaining([
      'tree',
      'shrub',
      'bench',
      'umbrella',
      'gardenTable',
      'stringLight',
      'flowerPatch',
      'grassTuft',
    ]));
    expect(gardenSector.tiles[0][9].detail).toBe('path');
    expect(gardenSector.tiles[4][1].detail).toBe('grass');
    expect(gardenSector.tiles[23][0].detail).toBe('hedge');
  });
});
