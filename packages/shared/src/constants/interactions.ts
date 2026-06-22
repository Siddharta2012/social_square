import type { Position } from '../types/events';

export const JUKEBOX_OBJECT_ID = 'jukebox';
export const JUKEBOX_POSITION: Position = { x: 16, y: 3 };
export const INTERACTION_RADIUS_TILES = 3.25;
export const PETAL_ACTION_COST = 100;
export const PETAL_BLOOM_VALUE = 25;
export const JUKEBOX_PLAY_COST = 200;
export const JUKEBOX_PLAY_DURATION_MS = 180_000;

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
