import { describe, expect, it } from 'vitest';
import type { BarSceneContext } from './barSceneContext';

describe('BarSceneContext', () => {
  it('is satisfiable by a minimal scene-like object', () => {
    const ctx: Partial<BarSceneContext> = {
      _myUserId: 'u1',
      _pendingPetalCollects: new Map(),
      _petalAttemptCooldowns: new Map(),
      _petalBlooms: [],
    };
    expect(ctx._myUserId).toBe('u1');
  });
});
