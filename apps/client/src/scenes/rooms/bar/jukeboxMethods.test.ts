import { Direction, JUKEBOX_PLAY_COST } from '@social-square/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useGameStore } from '../../../store/gameStore';
import { JUKEBOX_OBJECT_ID } from '../../../world/interactions';
import { requestJukeboxPlayUrl } from './jukeboxMethods';

function jukeboxContext() {
  return {
    _isInJukeboxLocation: vi.fn(() => true),
    _isNear: vi.fn(() => true),
    _localPosition: vi.fn(() => ({ x: 16, y: 3 })),
    _showNotice: vi.fn(),
    _jukeboxState: { playing: false },
    movementSystem: { isMoving: false },
    _network: {
      emitMove: vi.fn(),
      emitInteract: vi.fn(),
    },
  };
}

describe('jukebox interactions', () => {
  beforeEach(() => {
    useGameStore.setState({ petals: JUKEBOX_PLAY_COST });
  });

  it('syncs server position before playing a YouTube URL', () => {
    const ctx = jukeboxContext();

    requestJukeboxPlayUrl.call(ctx, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');

    expect(ctx._network.emitMove).toHaveBeenCalledWith(16, 3, Direction.SE, 'idle', true);
    expect(ctx._network.emitInteract).toHaveBeenCalledWith(
      JUKEBOX_OBJECT_ID,
      'jukebox-play-url',
      expect.objectContaining({
        url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        requestId: expect.stringMatching(/^jukebox-play-url:/),
        playerX: 16,
        playerY: 3,
      }),
    );
    expect(ctx._network.emitMove.mock.invocationCallOrder[0]).toBeLessThan(
      ctx._network.emitInteract.mock.invocationCallOrder[0],
    );
  });

  it('does not charge or emit when the YouTube URL is invalid', () => {
    const ctx = jukeboxContext();

    requestJukeboxPlayUrl.call(ctx, 'https://example.com/watch?v=dQw4w9WgXcQ');

    expect(ctx._network.emitMove).not.toHaveBeenCalled();
    expect(ctx._network.emitInteract).not.toHaveBeenCalled();
    expect(ctx._showNotice).toHaveBeenCalled();
  });
});
