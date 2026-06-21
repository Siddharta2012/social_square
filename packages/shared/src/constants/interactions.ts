import type { Position } from '../types/events';

export const JUKEBOX_OBJECT_ID = 'jukebox';
export const JUKEBOX_POSITION: Position = { x: 16, y: 3 };

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
