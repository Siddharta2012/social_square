import { describe, expect, it } from 'vitest';
import { MovementSystem } from '../systems/MovementSystem';
import { SectorLoader } from './SectorLoader';
import { WorldMap } from './WorldMap';
import { WorldStreamer } from './WorldStreamer';
import { SECTOR_REGISTRY } from './sectors';

async function loadStartRing(): Promise<WorldMap> {
  const map = new WorldMap();
  const streamer = new WorldStreamer(map, new SectorLoader(SECTOR_REGISTRY));
  await streamer.update(9, 14);
  return map;
}

describe('phase 0 world integration', () => {
  it('loads the bar and garden sectors from the real registry', async () => {
    const map = await loadStartRing();
    expect(map.hasSector(0, 0)).toBe(true);
    expect(map.hasSector(0, 1)).toBe(true);
  });

  it('keeps bar station tiles blocked while the doorway and garden path are walkable', async () => {
    const map = await loadStartRing();
    expect(map.isWalkable(2, 0)).toBe(false);
    expect(map.isWalkable(6, 0)).toBe(false);
    expect(map.isWalkable(9, 16)).toBe(true);
    expect(map.isWalkable(9, 23)).toBe(true);
    expect(map.isWalkable(9, 24)).toBe(true);
    expect(map.isWalkable(9, 25)).toBe(true);
  });

  it('can path continuously from the bar spawn into the garden and back', async () => {
    const map = await loadStartRing();
    const movement = new MovementSystem(map, 20);
    movement.setPosition(9, 14);

    movement.moveTo(9, 25);
    expect(movement.isMoving).toBe(true);
    for (let i = 0; i < 80 && movement.isMoving; i++) movement.update(0.05);
    expect(movement.posX).toBe(9);
    expect(movement.posY).toBe(25);

    movement.moveTo(9, 14);
    expect(movement.isMoving).toBe(true);
    for (let i = 0; i < 80 && movement.isMoving; i++) movement.update(0.05);
    expect(movement.posX).toBe(9);
    expect(movement.posY).toBe(14);
  });
});
