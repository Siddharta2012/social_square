import { describe, expect, it } from 'vitest';
import { MovementSystem } from '../systems/MovementSystem';
import { SectorLoader } from './SectorLoader';
import { SECTOR_REGISTRY } from './sectors';
import { sector as streetSector } from './sectors/sector_1_0';
import { sector as plazaSector } from './sectors/sector_1_1';
import { sector as riversideSector } from './sectors/sector_2_0';
import { sector as neighborhoodSector } from './sectors/sector_2_1';
import { WorldMap } from './WorldMap';

describe('phase 6 village neighborhood expansion', () => {
  it('registers the riverside and neighborhood sectors as async chunks', async () => {
    const loader = new SectorLoader(SECTOR_REGISTRY);
    expect(await loader.load(2, 0)).not.toBeNull();
    expect(await loader.load(2, 1)).not.toBeNull();
  });

  it('keeps routes continuous across plaza, street, riverside, and neighborhood', () => {
    const map = new WorldMap();
    map.setSector(plazaSector);
    map.setSector(streetSector);
    map.setSector(riversideSector);
    map.setSector(neighborhoodSector);

    expect(map.isWalkable(47, 37)).toBe(true);
    expect(map.isWalkable(48, 37)).toBe(true);
    expect(map.isWalkable(47, 12)).toBe(true);
    expect(map.isWalkable(48, 12)).toBe(true);
    expect(map.isWalkable(58, 23)).toBe(true);
    expect(map.isWalkable(58, 24)).toBe(true);

    const movement = new MovementSystem(map, 20);
    movement.setPosition(36, 37);
    expect(movement.moveTo(58, 37)).toBe(true);
    movement.setPosition(36, 12);
    expect(movement.moveTo(60, 12)).toBe(true);
    movement.setPosition(58, 22);
    expect(movement.moveTo(58, 26)).toBe(true);
  });

  it('adds riverside water, a bridge crossing, and residential points of interest', () => {
    expect(riversideSector.tiles[4][20]).toMatchObject({ walkable: false, detail: 'water' });
    expect(riversideSector.tiles[12][20]).toMatchObject({ walkable: true, detail: 'wood' });

    const riversideKinds = new Set(riversideSector.decorations?.map((decoration) => decoration.kind));
    const neighborhoodKinds = new Set(neighborhoodSector.decorations?.map((decoration) => decoration.kind));

    expect(riversideKinds.has('bench')).toBe(true);
    expect(riversideKinds.has('streetLamp')).toBe(true);
    expect(riversideKinds.has('marketStall')).toBe(true);
    expect(neighborhoodKinds.has('well')).toBe(true);
    expect(neighborhoodKinds.has('shopFront')).toBe(true);
    expect(neighborhoodKinds.has('signpost')).toBe(true);
  });
});
