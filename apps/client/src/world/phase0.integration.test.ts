import { describe, expect, it } from 'vitest';
import { MovementSystem } from '../systems/MovementSystem';
import { LOCATION_DEFINITIONS, exitsForLocation, locationForId, validateLocationDefinitions } from './locations';
import { SectorLoader } from './SectorLoader';
import { SECTOR_REGISTRY } from './sectors';
import { WorldMap } from './WorldMap';
import { WorldStreamer } from './WorldStreamer';

async function loadAt(x: number, y: number): Promise<WorldMap> {
  const map = new WorldMap();
  const streamer = new WorldStreamer(map, new SectorLoader(SECTOR_REGISTRY));
  await streamer.update(x, y);
  return map;
}

describe('phase 0 world integration', () => {
  it('loads only the current bar sector from the real registry', async () => {
    const map = await loadAt(9, 14);
    expect(map.hasSector(0, 0)).toBe(true);
    expect(map.hasSector(0, 1)).toBe(false);
    expect(map.stats().sectors).toBe(1);
  });

  it('keeps streamer stats scoped to a single active location and clears on destroy', async () => {
    const map = new WorldMap();
    const streamer = new WorldStreamer(map, new SectorLoader(SECTOR_REGISTRY));

    await streamer.update(9, 14);
    expect(streamer.stats().activeKeys).toEqual(['0,0']);
    expect(streamer.stats().loadedKeys).toEqual(['0,0']);
    expect(map.stats().sectors).toBe(1);

    await streamer.update(9, 25);
    expect(streamer.stats().activeKeys).toEqual(['0,1']);
    expect(streamer.stats().loadedKeys).toEqual(['0,1']);
    expect(map.hasSector(0, 0)).toBe(false);
    expect(map.hasSector(0, 1)).toBe(true);

    streamer.destroy();
    expect(streamer.stats().loadedKeys).toEqual([]);
    expect(map.stats().sectors).toBe(0);
  });

  it('keeps the location graph internally valid', () => {
    expect(validateLocationDefinitions()).toEqual([]);
    for (const location of LOCATION_DEFINITIONS) {
      expect(location.description.trim().length).toBeGreaterThan(0);
      expect(location.id).toBe(`${location.sx},${location.sy}`);
    }
  });

  it('keeps bar fixtures blocked while the exit trigger is walkable', async () => {
    const map = await loadAt(9, 14);
    expect(map.isWalkable(2, 0)).toBe(false);
    expect(map.isWalkable(6, 0)).toBe(false);
    expect(map.isWalkable(9, 16)).toBe(true);
    expect(map.isWalkable(9, 23)).toBe(true);
    expect(map.isWalkable(9, 24)).toBe(false);
  });

  it('loads the garden only after entering its location', async () => {
    const gardenMap = await loadAt(9, 25);
    expect(gardenMap.hasSector(0, 0)).toBe(false);
    expect(gardenMap.hasSector(0, 1)).toBe(true);
    expect(gardenMap.isWalkable(9, 24)).toBe(true);
    expect(gardenMap.isWalkable(9, 25)).toBe(true);
  });

  it('can path to the bar exit and defines a garden arrival', async () => {
    const map = await loadAt(9, 14);
    const movement = new MovementSystem(map, 20);
    movement.setPosition(9, 14);

    movement.moveTo(9, 23);
    expect(movement.isMoving).toBe(true);
    for (let i = 0; i < 80 && movement.isMoving; i++) movement.update(0.05);
    expect(movement.posX).toBe(9);
    expect(movement.posY).toBe(23);
    expect(exitsForLocation('0,0')[0].arrival).toEqual({ x: 9, y: 25 });
  });

  it('keeps every location exit and arrival on walkable tiles', async () => {
    for (const location of LOCATION_DEFINITIONS) {
      for (const exit of location.exits) {
        const target = locationForId(exit.targetId);
        expect(target, exit.id).not.toBeNull();

        const sourceMap = await loadAt(exit.trigger.x, exit.trigger.y);
        expect(sourceMap.isWalkable(exit.trigger.x, exit.trigger.y), `${exit.id} trigger`).toBe(true);

        const targetMap = await loadAt(exit.arrival.x, exit.arrival.y);
        expect(targetMap.isWalkable(exit.arrival.x, exit.arrival.y), `${exit.id} arrival`).toBe(true);
      }
    }
  });
});
