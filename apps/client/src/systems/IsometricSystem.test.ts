import { describe, expect, it } from 'vitest';
import { IsometricSystem } from './IsometricSystem';

describe('IsometricSystem', () => {
  it('updates registered object depth through the cached entry', () => {
    const iso = new IsometricSystem();
    const object = { depth: 0 };

    iso.register(object as any, 1, 2);
    iso.update();
    expect(object.depth).toBe(3);

    iso.updatePosition(object as any, 5, 7);
    iso.update();
    expect(object.depth).toBe(12);

    iso.unregister(object as any);
    expect(iso.stats().objects).toBe(0);
  });
});
