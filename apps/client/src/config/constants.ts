export const TILE_WIDTH = 64;
export const TILE_HEIGHT = 32;
export const TILE_HALF_WIDTH = TILE_WIDTH / 2;
export const TILE_HALF_HEIGHT = TILE_HEIGHT / 2;

export const MOVE_EMIT_INTERVAL = 50; // ms — 20 updates/sec max

export const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';
// In production the client is served from the same origin as the server,
// so an empty string makes Socket.IO connect to window.location.origin.
export const SOCKET_URL = import.meta.env.VITE_SOCKET_URL ?? (import.meta.env.PROD ? '' : 'http://localhost:3000');
export const LIVEKIT_URL = import.meta.env.VITE_LIVEKIT_URL ?? 'wss://localhost:7880';
