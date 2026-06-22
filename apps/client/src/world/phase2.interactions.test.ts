import {
  DEFAULT_JUKEBOX_TRACK_ID,
  JUKEBOX_PLAY_COST,
  JUKEBOX_PLAY_DURATION_MS,
  JUKEBOX_TRACKS,
  POOL_OBJECT_ID,
  POOL_PLAY_DURATION_MS,
  POOL_PLAY_COST,
  POOL_POSITION,
  normalizePoolState,
  nextJukeboxTrackId,
  normalizeJukeboxState,
  parseJukeboxExternalTrack,
  parseYouTubeVideoId,
} from '@social-square/shared';
import { describe, expect, it } from 'vitest';
import {
  INTERACTION_RADIUS_TILES,
  JUKEBOX_OBJECT_ID,
  PETAL_SPAWN_CONFIGS,
  PETAL_ACTION_COST,
  SEAT_DEFINITIONS,
  isWithinInteractionRange,
} from './interactions';
import { sector as barSector } from './sectors/sector_0_0';
import { sector as gardenSector } from './sectors/sector_0_1';
import { sector as shopsSector } from './sectors/sector_1_0';
import { sector as plazaSector } from './sectors/sector_1_1';
import { WorldMap } from './WorldMap';

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
    expect(JUKEBOX_PLAY_COST).toBe(200);
    expect(POOL_PLAY_COST).toBe(200);
    expect(JUKEBOX_PLAY_DURATION_MS).toBe(180_000);
    expect(POOL_PLAY_DURATION_MS).toBe(600_000);
    expect(INTERACTION_RADIUS_TILES).toBeGreaterThan(2);
    expect(isWithinInteractionRange({ x: 16, y: 3 }, { x: 17, y: 4 })).toBe(true);
    expect(isWithinInteractionRange({ x: 16, y: 3 }, { x: 22, y: 8 })).toBe(false);
  });

  it('defines billiards as a paid bar interaction', () => {
    const state = normalizePoolState({
      phase: 'waiting',
      mode: 'duo',
      players: [{ userId: 'a', username: 'A' }],
      startedAt: 1000,
      expiresAt: 1000 + POOL_PLAY_DURATION_MS,
      lastShot: {
        shotId: 'shot-1',
        userId: 'a',
        angle: 0,
        power: 0.5,
        spin: 2,
        createdAt: 1000,
      },
    }, 1000);

    expect(POOL_OBJECT_ID).toBe('pool:bar');
    expect(POOL_POSITION).toEqual({ x: 9, y: 8 });
    expect(state.phase).toBe('waiting');
    expect(state.players[0].userId).toBe('a');
    expect(state.expiresAt).toBe(601_000);
    expect(state.lastShot?.spin).toBe(1);
  });

  it('keeps configured petal spawn points on walkable tiles', () => {
    const map = new WorldMap();
    map.setSector(barSector);
    map.setSector(gardenSector);
    map.setSector(shopsSector);
    map.setSector(plazaSector);

    for (const config of Object.values(PETAL_SPAWN_CONFIGS)) {
      for (const point of config.points) {
        expect(map.isWalkable(point.x, point.y), `${config.locationId}:${point.x},${point.y}`).toBe(true);
      }
    }
  });

  it('normalizes unknown jukebox state to a safe stopped default', () => {
    expect(normalizeJukeboxState({ trackId: 'missing', playing: true }, 1000)).toEqual({
      trackId: DEFAULT_JUKEBOX_TRACK_ID,
      externalTrack: undefined,
      playing: false,
      startedAt: null,
      expiresAt: null,
      updatedAt: 1000,
      requestedBy: undefined,
    });
  });

  it('expires paid jukebox playback after its play window', () => {
    expect(normalizeJukeboxState({
      trackId: DEFAULT_JUKEBOX_TRACK_ID,
      playing: true,
      startedAt: 1000,
      expiresAt: 2000,
      updatedAt: 1000,
    }, 2500).playing).toBe(false);
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
      expiresAt: 1200 + JUKEBOX_PLAY_DURATION_MS,
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
