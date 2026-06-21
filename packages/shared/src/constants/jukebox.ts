export const JUKEBOX_TRACKS = [
  { id: 'sunset-swing', title: 'Sunset Swing', durationMs: 8000 },
  { id: 'garden-groove', title: 'Garden Groove', durationMs: 8000 },
  { id: 'midnight-pixels', title: 'Midnight Pixels', durationMs: 8000 },
] as const;

export type JukeboxTrackId = (typeof JUKEBOX_TRACKS)[number]['id'];

export interface JukeboxState {
  trackId: JukeboxTrackId;
  playing: boolean;
  /** Epoch milliseconds used by clients to align loop position. */
  startedAt: number | null;
  updatedAt: number;
  requestedBy?: string;
}

export const DEFAULT_JUKEBOX_TRACK_ID: JukeboxTrackId = JUKEBOX_TRACKS[0].id;

const TRACK_IDS = new Set<string>(JUKEBOX_TRACKS.map((track) => track.id));

export function isJukeboxTrackId(value: unknown): value is JukeboxTrackId {
  return typeof value === 'string' && TRACK_IDS.has(value);
}

export function nextJukeboxTrackId(trackId: JukeboxTrackId): JukeboxTrackId {
  const index = JUKEBOX_TRACKS.findIndex((track) => track.id === trackId);
  return JUKEBOX_TRACKS[(index + 1) % JUKEBOX_TRACKS.length].id;
}

export function jukeboxTitle(trackId: JukeboxTrackId): string {
  return JUKEBOX_TRACKS.find((track) => track.id === trackId)?.title ?? trackId;
}

export function normalizeJukeboxState(value: unknown, now = Date.now()): JukeboxState {
  const raw = value && typeof value === 'object' ? value as Partial<JukeboxState> : {};
  const trackId = isJukeboxTrackId(raw.trackId) ? raw.trackId : DEFAULT_JUKEBOX_TRACK_ID;
  return {
    trackId,
    playing: raw.playing === true,
    startedAt: typeof raw.startedAt === 'number' ? raw.startedAt : null,
    updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : now,
    requestedBy: typeof raw.requestedBy === 'string' ? raw.requestedBy : undefined,
  };
}
