import { describe, expect, it } from 'vitest';
import {
  DEFAULT_JUKEBOX_TRACK_ID,
  JUKEBOX_TRACKS,
  nextJukeboxTrackId,
  normalizeJukeboxState,
  parseJukeboxExternalTrack,
  parseYouTubeVideoId,
} from '@social-square/shared';
import { WorldMap } from './WorldMap';
import {
  INTERACTION_RADIUS_TILES,
  JUKEBOX_OBJECT_ID,
  PETAL_ACTION_COST,
  SEAT_DEFINITIONS,
  isWithinInteractionRange,
} from './interactions';
import { sector as barSector } from './sectors/sector_0_0';
import { sector as gardenSector } from './sectors/sector_0_1';

describe('phase 2 interaction data', () => {
  it('keeps every declared seat on a walkable tile', () => {
    const map = new WorldMap();
    map.setSector(barSector);
    map.setSector(gardenSector);

    for (const seat of SEAT_DEFINITIONS) {
      expect(map.isWalkable(seat.x, seat.y), seat.id).toBe(true);
    }
  });

  it('defines a stable jukebox object and cyclic playlist', () => {
    expect(JUKEBOX_OBJECT_ID).toBe('jukebox');
    expect(JUKEBOX_TRACKS.length).toBeGreaterThanOrEqual(3);
    const lastTrack = JUKEBOX_TRACKS[JUKEBOX_TRACKS.length - 1].id;
    expect(nextJukeboxTrackId(lastTrack)).toBe(DEFAULT_JUKEBOX_TRACK_ID);
  });

  it('defines proximity and petal costs for location based actions', () => {
    expect(PETAL_ACTION_COST).toBe(100);
    expect(INTERACTION_RADIUS_TILES).toBeGreaterThan(2);
    expect(isWithinInteractionRange({ x: 16, y: 3 }, { x: 17, y: 4 })).toBe(true);
    expect(isWithinInteractionRange({ x: 16, y: 3 }, { x: 22, y: 8 })).toBe(false);
  });

  it('normalizes unknown jukebox state to a safe stopped default', () => {
    expect(normalizeJukeboxState({ trackId: 'missing', playing: true }, 1000)).toEqual({
      trackId: DEFAULT_JUKEBOX_TRACK_ID,
      externalTrack: undefined,
      playing: true,
      startedAt: null,
      updatedAt: 1000,
      requestedBy: undefined,
    });
  });

  it('accepts only allowlisted YouTube jukebox links', () => {
    expect(parseYouTubeVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(parseYouTubeVideoId('https://youtu.be/dQw4w9WgXcQ?t=12')).toBe('dQw4w9WgXcQ');
    expect(parseYouTubeVideoId('https://www.youtube.com/shorts/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(parseYouTubeVideoId('dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(parseYouTubeVideoId('https://example.com/watch?v=dQw4w9WgXcQ')).toBeNull();
  });

  it('normalizes external jukebox media into safe metadata', () => {
    const state = normalizeJukeboxState({
      trackId: DEFAULT_JUKEBOX_TRACK_ID,
      externalTrack: parseJukeboxExternalTrack('https://youtu.be/dQw4w9WgXcQ'),
      playing: true,
      startedAt: 1200,
      updatedAt: 1300,
    }, 1000);

    expect(state.externalTrack).toEqual({
      provider: 'youtube',
      videoId: 'dQw4w9WgXcQ',
      title: 'YouTube dQw4w9WgXcQ',
      url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    });
  });
});
