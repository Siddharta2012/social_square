import { describe, expect, it } from 'vitest';
import { MovementSystem, type Walkable } from './MovementSystem';

function gridWalkable(grid: boolean[][]): Walkable {
  return {
    isWalkable: (x, y) => grid[y]?.[x] ?? false,
  };
}

describe('MovementSystem', () => {
  it('paths in a straight line on an open grid', () => {
    const grid = Array.from({ length: 3 }, () => [true, true, true]);
    const movement = new MovementSystem(gridWalkable(grid), 5);
    movement.setPosition(0, 0);
    expect(movement.moveTo(2, 0)).toBe(true);
    expect(movement.isMoving).toBe(true);
  });

  it('does not move to a non-walkable target', () => {
    const grid = [[true, false]];
    const movement = new MovementSystem(gridWalkable(grid), 5);
    movement.setPosition(0, 0);
    expect(movement.moveTo(1, 0)).toBe(false);
    expect(movement.isMoving).toBe(false);
  });

  it('advances position over time toward the target', () => {
    const grid = Array.from({ length: 1 }, () => [true, true, true]);
    const movement = new MovementSystem(gridWalkable(grid), 1);
    movement.setPosition(0, 0);
    movement.moveTo(2, 0);
    movement.update(1);
    expect(movement.posX).toBeGreaterThan(0.5);
    expect(movement.posY).toBe(0);
  });
});
