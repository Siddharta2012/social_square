import { describe, expect, it } from 'vitest';
import {
  DEFAULT_JUKEBOX_TRACK_ID,
  JUKEBOX_TRACKS,
  nextJukeboxTrackId,
  normalizeJukeboxState,
} from '@social-square/shared';
import { WorldMap } from './WorldMap';
import { JUKEBOX_OBJECT_ID, SEAT_DEFINITIONS } from './interactions';
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

  it('normalizes unknown jukebox state to a safe stopped default', () => {
    expect(normalizeJukeboxState({ trackId: 'missing', playing: true }, 1000)).toEqual({
      trackId: DEFAULT_JUKEBOX_TRACK_ID,
      playing: true,
      startedAt: null,
      updatedAt: 1000,
      requestedBy: undefined,
    });
  });
});
