import { describe, expect, it } from 'vitest';
import {
  DEFAULT_JUKEBOX_TRACK_ID,
  JUKEBOX_TRACKS,
  nextJukeboxTrackId,
  normalizeJukeboxState,
  parseJukeboxExternalTrack,
  parseYouTubeVideoId,
} from './jukebox';

describe('jukebox helpers', () => {
  it('normalizes expired play windows', () => {
    const state = normalizeJukeboxState({
      trackId: DEFAULT_JUKEBOX_TRACK_ID,
      playing: true,
      startedAt: 100,
      expiresAt: 200,
      updatedAt: 100,
      requestedBy: 'Ada',
    }, 201);

    expect(state.playing).toBe(false);
    expect(state.startedAt).toBeNull();
  });

  it('cycles known tracks', () => {
    expect(nextJukeboxTrackId(JUKEBOX_TRACKS[JUKEBOX_TRACKS.length - 1].id)).toBe(DEFAULT_JUKEBOX_TRACK_ID);
  });

  it('accepts safe YouTube URLs and rejects other hosts', () => {
    expect(parseYouTubeVideoId('https://youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(parseJukeboxExternalTrack('https://example.com/watch?v=dQw4w9WgXcQ')).toBeNull();
  });
});
