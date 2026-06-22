import {
  DEFAULT_JUKEBOX_TRACK_ID,
  JUKEBOX_PLAY_DURATION_MS,
  normalizeJukeboxState,
  parseJukeboxExternalTrack,
} from '@social-square/shared';
import { describe, expect, it } from 'vitest';

describe('jukebox lock rules', () => {
  it('keeps a paid track active for the configured play window', () => {
    const now = 10_000;
    const active = normalizeJukeboxState({
      trackId: DEFAULT_JUKEBOX_TRACK_ID,
      playing: true,
      startedAt: now,
      expiresAt: now + JUKEBOX_PLAY_DURATION_MS,
      updatedAt: now,
      requestedBy: 'Tester',
    }, now + 90_000);

    expect(active.playing).toBe(true);
    expect(active.requestedBy).toBe('Tester');

    const expired = normalizeJukeboxState(active, now + JUKEBOX_PLAY_DURATION_MS + 1);
    expect(expired.playing).toBe(false);
  });

  it('accepts only allowlisted YouTube inputs for external jukebox media', () => {
    expect(parseJukeboxExternalTrack('https://www.youtube.com/watch?v=dQw4w9WgXcQ')?.provider).toBe('youtube');
    expect(parseJukeboxExternalTrack('https://example.com/watch?v=dQw4w9WgXcQ')).toBeNull();
  });
});
