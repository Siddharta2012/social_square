import type { Position } from '../types/events';

export const JUKEBOX_OBJECT_ID = 'jukebox';
export const JUKEBOX_POSITION: Position = { x: 16, y: 3 };
export const BAR_SERVICE_OBJECT_ID = 'bar:service';
export const PETAL_BLOOM_OBJECT_ID = 'petal-bloom';
export const BAR_BEER_POSITION: Position = { x: 2, y: 0 };
export const BAR_PRETZEL_POSITION: Position = { x: 6, y: 0 };
export const INTERACTION_RADIUS_TILES = 3.25;
export const PETAL_ACTION_COST = 100;
export const PETAL_BLOOM_VALUE = 25;
export const DAILY_PRESENCE_REWARD = 100;
export const JUKEBOX_PLAY_COST = 200;
export const JUKEBOX_PLAY_DURATION_MS = 180_000;
export const COSMETIC_BASE_COST = 800;

export interface SeatDefinition {
  id: string;
  x: number;
  y: number;
  label: string;
  kind: 'stool' | 'bench';
}

export const SEAT_DEFINITIONS: SeatDefinition[] = [
  { id: 'seat:bar-stool-1', x: 1, y: 1, label: 'Sgabello bancone', kind: 'stool' },
  { id: 'seat:bar-stool-2', x: 3, y: 1, label: 'Sgabello bancone', kind: 'stool' },
  { id: 'seat:bar-stool-3', x: 5, y: 1, label: 'Sgabello bancone', kind: 'stool' },
  { id: 'seat:bar-stool-4', x: 7, y: 1, label: 'Sgabello bancone', kind: 'stool' },
  { id: 'seat:table-west', x: 3, y: 6, label: 'Sedia tavolo', kind: 'stool' },
  { id: 'seat:table-east', x: 14, y: 6, label: 'Sedia tavolo', kind: 'stool' },
  { id: 'seat:table-near-west', x: 6, y: 11, label: 'Sedia tavolo', kind: 'stool' },
  { id: 'seat:table-near-center', x: 11, y: 11, label: 'Sedia tavolo', kind: 'stool' },
  { id: 'seat:table-near-east', x: 14, y: 11, label: 'Sedia tavolo', kind: 'stool' },
  { id: 'seat:garden-bench-west', x: 7, y: 32, label: 'Panca giardino', kind: 'bench' },
  { id: 'seat:garden-bench-south', x: 12, y: 41, label: 'Panca giardino', kind: 'bench' },
];

export interface PetalSpawnConfig {
  locationId: string;
  maxActive: number;
  intervalMs: number;
  initialActive: number;
  value: number;
  points: Position[];
}

export const PETAL_SPAWN_CONFIGS: Record<string, PetalSpawnConfig> = {
  '0,1': {
    locationId: '0,1',
    maxActive: 5,
    intervalMs: 9000,
    initialActive: 3,
    value: PETAL_BLOOM_VALUE,
    points: [
      { x: 3, y: 35 },
      { x: 12, y: 30 },
      { x: 20, y: 42 },
      { x: 11, y: 43 },
    ],
  },
  '1,1': {
    locationId: '1,1',
    maxActive: 4,
    intervalMs: 12000,
    initialActive: 2,
    value: PETAL_BLOOM_VALUE,
    points: [
      { x: 28, y: 33 },
      { x: 35, y: 42 },
      { x: 41, y: 30 },
    ],
  },
  '1,0': {
    locationId: '1,0',
    maxActive: 3,
    intervalMs: 14000,
    initialActive: 1,
    value: PETAL_BLOOM_VALUE,
    points: [
      { x: 44, y: 14 },
    ],
  },
};

export function petalSpawnConfigForLocation(locationId: string): PetalSpawnConfig | null {
  return PETAL_SPAWN_CONFIGS[locationId] ?? null;
}

export function petalPointKey(position: Position): string {
  return `${Math.round(position.x)},${Math.round(position.y)}`;
}

export function isSeatObjectId(objectId: string): boolean {
  return objectId.startsWith('seat:');
}

export function isWithinInteractionRange(
  a: Position,
  b: Position,
  radius = INTERACTION_RADIUS_TILES,
): boolean {
  if (!Number.isFinite(a.x) || !Number.isFinite(a.y) || !Number.isFinite(b.x) || !Number.isFinite(b.y)) {
    return false;
  }

  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy) <= radius;
}
