import { describe, expect, it, vi } from 'vitest';
import { JukeboxPlayer } from './JukeboxPlayer';

describe('JukeboxPlayer.destroy', () => {
  it('closes the AudioContext it created', () => {
    const close = vi.fn().mockResolvedValue(undefined);
    const mockAudioContext = {
      createMediaElementSource: vi.fn(() => ({ connect: vi.fn(), disconnect: vi.fn() })),
      createGain: vi.fn(() => ({ connect: vi.fn(), disconnect: vi.fn(), gain: { setTargetAtTime: vi.fn() } })),
      createStereoPanner: vi.fn(() => ({ connect: vi.fn(), disconnect: vi.fn(), pan: { setTargetAtTime: vi.fn() } })),
      resume: vi.fn().mockResolvedValue(undefined),
      currentTime: 0,
      destination: {},
      state: 'running' as AudioContextState,
      close,
    };
    const AudioContextMock = vi.fn(() => mockAudioContext);
    vi.stubGlobal('AudioContext', AudioContextMock);

    const player = new JukeboxPlayer();
    // Inject the mock context directly to simulate it being created
    (player as any)._audioContext = mockAudioContext;
    (player as any)._audioSource = { disconnect: vi.fn() };
    (player as any)._audioGain = { disconnect: vi.fn() };
    (player as any)._audioPanner = { disconnect: vi.fn() };

    player.destroy();
    expect(close).toHaveBeenCalledTimes(1);

    vi.unstubAllGlobals();
  });

  it('does not throw if AudioContext was never created', () => {
    const player = new JukeboxPlayer();
    expect(() => player.destroy()).not.toThrow();
  });
});
