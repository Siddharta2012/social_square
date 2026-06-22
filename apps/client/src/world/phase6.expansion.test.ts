import { describe, expect, it } from 'vitest';
import { MovementSystem } from '../systems/MovementSystem';
import { SectorLoader } from './SectorLoader';
import { SECTOR_REGISTRY } from './sectors';
import { sector as gardenSector } from './sectors/sector_0_1';
import { sector as streetSector } from './sectors/sector_1_0';
import { sector as plazaSector } from './sectors/sector_1_1';
import { WorldMap } from './WorldMap';

describe('phase 6 village expansion', () => {
  it('registers the village street and plaza as async sectors', async () => {
    const loader = new SectorLoader(SECTOR_REGISTRY);
    expect(await loader.load(1, 0)).not.toBeNull();
    expect(await loader.load(1, 1)).not.toBeNull();
  });

  it('keeps the garden-to-plaza and plaza-to-street routes walkable', () => {
    const map = new WorldMap();
    map.setSector(gardenSector);
    map.setSector(plazaSector);
    map.setSector(streetSector);

    expect(map.isWalkable(23, 37)).toBe(true);
    expect(map.isWalkable(24, 37)).toBe(true);
    expect(map.isWalkable(34, 24)).toBe(true);
    expect(map.isWalkable(34, 23)).toBe(true);

    const movement = new MovementSystem(map, 20);
    movement.setPosition(22, 37);
    expect(movement.moveTo(36, 37)).toBe(true);
    movement.setPosition(34, 25);
    expect(movement.moveTo(34, 22)).toBe(true);
  });

  it('adds village points of interest to the new sectors', () => {
    const plazaKinds = new Set(plazaSector.decorations?.map((decoration) => decoration.kind));
    const streetKinds = new Set(streetSector.decorations?.map((decoration) => decoration.kind));

    expect(plazaKinds.has('fountain')).toBe(true);
    expect(plazaKinds.has('marketStall')).toBe(true);
    expect(plazaKinds.has('streetLamp')).toBe(true);
    expect(plazaKinds.has('signpost')).toBe(true);
    expect(streetKinds.has('shopFront')).toBe(true);
    expect(streetKinds.has('planter')).toBe(true);
    expect(streetKinds.has('streetLamp')).toBe(true);
  });
});
