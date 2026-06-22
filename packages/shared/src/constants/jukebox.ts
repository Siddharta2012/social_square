export const JUKEBOX_TRACKS = [
  { id: 'sunset-swing', title: 'Sunset Swing', durationMs: 8000 },
  { id: 'garden-groove', title: 'Garden Groove', durationMs: 8000 },
  { id: 'midnight-pixels', title: 'Midnight Pixels', durationMs: 8000 },
] as const;

export type JukeboxTrackId = (typeof JUKEBOX_TRACKS)[number]['id'];

export type JukeboxExternalProvider = 'youtube';

export interface JukeboxExternalTrack {
  provider: JukeboxExternalProvider;
  videoId: string;
  title: string;
  url: string;
}

export interface JukeboxState {
  trackId: JukeboxTrackId;
  externalTrack?: JukeboxExternalTrack;
  playing: boolean;
  /** Epoch milliseconds used by clients to align loop position. */
  startedAt: number | null;
  updatedAt: number;
  requestedBy?: string;
}

export const DEFAULT_JUKEBOX_TRACK_ID: JukeboxTrackId = JUKEBOX_TRACKS[0].id;

const TRACK_IDS = new Set<string>(JUKEBOX_TRACKS.map((track) => track.id));
const YOUTUBE_ID_RE = /^[A-Za-z0-9_-]{11}$/;
const YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtube-nocookie.com',
  'www.youtube-nocookie.com',
]);
const YOUTU_BE_HOSTS = new Set(['youtu.be', 'www.youtu.be']);

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

export function isYouTubeVideoId(value: unknown): boolean {
  return typeof value === 'string' && YOUTUBE_ID_RE.test(value);
}

export function parseYouTubeVideoId(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (isYouTubeVideoId(trimmed)) return trimmed;

  const normalized = trimmed.includes('://') ? trimmed : `https://${trimmed}`;
  const match = /^https?:\/\/([^/?#]+)([^#]*)/i.exec(normalized);
  if (!match) return null;

  const host = match[1].toLowerCase();
  const rest = match[2] ?? '';
  if (YOUTU_BE_HOSTS.has(host)) {
    return candidateVideoId(rest.split(/[/?#&]/).filter(Boolean)[0]);
  }

  if (!YOUTUBE_HOSTS.has(host)) return null;

  const watchId = queryParam(rest, 'v');
  if (isYouTubeVideoId(watchId)) return watchId;

  const path = rest.split('?')[0] ?? '';
  const parts = path.split('/').filter(Boolean);
  const marker = parts.findIndex((part) => ['embed', 'shorts', 'live'].includes(part));
  return candidateVideoId(marker >= 0 ? parts[marker + 1] : null);
}

export function youtubeWatchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

export function youtubeEmbedUrl(videoId: string, startSeconds = 0, origin?: string): string {
  const params = [
    ['autoplay', '1'],
    ['controls', '1'],
    ['enablejsapi', '1'],
    ['playsinline', '1'],
    ['rel', '0'],
    ['start', String(Math.max(0, Math.floor(startSeconds)))],
  ];
  if (origin) params.push(['origin', origin]);
  const query = params.map(([key, value]) => `${key}=${encodeURIComponent(value)}`).join('&');
  return `https://www.youtube-nocookie.com/embed/${videoId}?${query}`;
}

export function parseJukeboxExternalTrack(input: unknown): JukeboxExternalTrack | null {
  const videoId = parseYouTubeVideoId(input);
  if (!videoId) return null;
  return {
    provider: 'youtube',
    videoId,
    title: `YouTube ${videoId}`,
    url: youtubeWatchUrl(videoId),
  };
}

export function normalizeJukeboxExternalTrack(value: unknown): JukeboxExternalTrack | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const raw = value as Partial<JukeboxExternalTrack>;
  if (raw.provider !== 'youtube') return undefined;
  const parsed = parseJukeboxExternalTrack(raw.videoId ?? raw.url);
  return parsed ?? undefined;
}

function queryParam(urlRest: string, key: string): string | null {
  const query = urlRest.split('?')[1]?.split('#')[0];
  if (!query) return null;
  for (const pair of query.split('&')) {
    const [rawKey, rawValue = ''] = pair.split('=');
    if (rawKey === key) return candidateVideoId(rawValue);
  }
  return null;
}

function candidateVideoId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const candidate = value.split(/[?&#/]/)[0];
  return isYouTubeVideoId(candidate) ? candidate : null;
}

export function normalizeJukeboxState(value: unknown, now = Date.now()): JukeboxState {
  const raw = value && typeof value === 'object' ? value as Partial<JukeboxState> : {};
  const trackId = isJukeboxTrackId(raw.trackId) ? raw.trackId : DEFAULT_JUKEBOX_TRACK_ID;
  return {
    trackId,
    externalTrack: normalizeJukeboxExternalTrack(raw.externalTrack),
    playing: raw.playing === true,
    startedAt: typeof raw.startedAt === 'number' ? raw.startedAt : null,
    updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : now,
    requestedBy: typeof raw.requestedBy === 'string' ? raw.requestedBy : undefined,
  };
}
