import { describe, expect, it } from 'vitest';
import { PETAL_AUTO_COLLECT_CHECK_MS } from './timing';

describe('petal collection timing', () => {
  it('keeps auto collect responsive without running every frame', () => {
    expect(PETAL_AUTO_COLLECT_CHECK_MS).toBeGreaterThanOrEqual(80);
    expect(PETAL_AUTO_COLLECT_CHECK_MS).toBeLessThanOrEqual(120);
  });
});
