import type { Position } from '@social-square/shared';
import { globalToSector, sectorKey } from './coords';

export type LocationId =
  | '0,0'
  | '0,1'
  | '1,0'
  | '1,1'
  | '2,0'
  | '2,1'
  | '1,2'
  | '0,2'
  | '2,2';

export type ExitDirection = 'north' | 'south' | 'east' | 'west';

export interface LocationExit {
  id: string;
  direction: ExitDirection;
  targetId: LocationId;
  trigger: Position;
  arrival: Position;
}

export interface LocationDefinition {
  id: LocationId;
  sx: number;
  sy: number;
  name: string;
  spawn: Position;
  fastTravel: boolean;
  exits: LocationExit[];
}

export interface WorldLocation {
  id: LocationId | string;
  sx: number;
  sy: number;
  name: string;
}

const DEFINITIONS: LocationDefinition[] = [
  {
    id: '0,0',
    sx: 0,
    sy: 0,
    name: 'Bar interno',
    spawn: { x: 9, y: 14 },
    fastTravel: true,
    exits: [
      { id: 'bar-garden', direction: 'south', targetId: '0,1', trigger: { x: 9, y: 23 }, arrival: { x: 9, y: 25 } },
    ],
  },
  {
    id: '0,1',
    sx: 0,
    sy: 1,
    name: 'Bar giardino',
    spawn: { x: 10, y: 32 },
    fastTravel: true,
    exits: [
      { id: 'garden-bar', direction: 'north', targetId: '0,0', trigger: { x: 9, y: 24 }, arrival: { x: 9, y: 22 } },
      { id: 'garden-plaza', direction: 'east', targetId: '1,1', trigger: { x: 23, y: 37 }, arrival: { x: 25, y: 37 } },
    ],
  },
  {
    id: '1,1',
    sx: 1,
    sy: 1,
    name: 'Piazza del paese',
    spawn: { x: 36, y: 36 },
    fastTravel: true,
    exits: [
      { id: 'plaza-garden', direction: 'west', targetId: '0,1', trigger: { x: 24, y: 37 }, arrival: { x: 22, y: 37 } },
      { id: 'plaza-shops', direction: 'north', targetId: '1,0', trigger: { x: 34, y: 24 }, arrival: { x: 34, y: 22 } },
      { id: 'plaza-neighborhood', direction: 'east', targetId: '2,1', trigger: { x: 47, y: 37 }, arrival: { x: 49, y: 37 } },
      { id: 'plaza-boulevard', direction: 'south', targetId: '1,2', trigger: { x: 34, y: 47 }, arrival: { x: 34, y: 49 } },
    ],
  },
  {
    id: '1,0',
    sx: 1,
    sy: 0,
    name: 'Via delle botteghe',
    spawn: { x: 34, y: 12 },
    fastTravel: true,
    exits: [
      { id: 'shops-plaza', direction: 'south', targetId: '1,1', trigger: { x: 34, y: 23 }, arrival: { x: 34, y: 25 } },
      { id: 'shops-riverside', direction: 'east', targetId: '2,0', trigger: { x: 47, y: 12 }, arrival: { x: 49, y: 12 } },
    ],
  },
  {
    id: '2,0',
    sx: 2,
    sy: 0,
    name: 'Lungocanale',
    spawn: { x: 58, y: 12 },
    fastTravel: true,
    exits: [
      { id: 'riverside-shops', direction: 'west', targetId: '1,0', trigger: { x: 48, y: 12 }, arrival: { x: 46, y: 12 } },
      { id: 'riverside-neighborhood', direction: 'south', targetId: '2,1', trigger: { x: 58, y: 23 }, arrival: { x: 58, y: 25 } },
    ],
  },
  {
    id: '2,1',
    sx: 2,
    sy: 1,
    name: 'Quartiere residenziale',
    spawn: { x: 58, y: 36 },
    fastTravel: true,
    exits: [
      { id: 'neighborhood-riverside', direction: 'north', targetId: '2,0', trigger: { x: 58, y: 24 }, arrival: { x: 58, y: 22 } },
      { id: 'neighborhood-plaza', direction: 'west', targetId: '1,1', trigger: { x: 48, y: 37 }, arrival: { x: 46, y: 37 } },
    ],
  },
  {
    id: '1,2',
    sx: 1,
    sy: 2,
    name: 'Vialone delle Ville',
    spawn: { x: 34, y: 56 },
    fastTravel: true,
    exits: [
      { id: 'boulevard-plaza', direction: 'north', targetId: '1,1', trigger: { x: 34, y: 48 }, arrival: { x: 34, y: 46 } },
      { id: 'boulevard-aurora', direction: 'west', targetId: '0,2', trigger: { x: 24, y: 59 }, arrival: { x: 22, y: 59 } },
      { id: 'boulevard-belvedere', direction: 'east', targetId: '2,2', trigger: { x: 47, y: 59 }, arrival: { x: 49, y: 59 } },
    ],
  },
  {
    id: '0,2',
    sx: 0,
    sy: 2,
    name: 'Villa Aurora',
    spawn: { x: 12, y: 58 },
    fastTravel: true,
    exits: [
      { id: 'aurora-boulevard', direction: 'east', targetId: '1,2', trigger: { x: 23, y: 59 }, arrival: { x: 25, y: 59 } },
    ],
  },
  {
    id: '2,2',
    sx: 2,
    sy: 2,
    name: 'Villa Belvedere',
    spawn: { x: 60, y: 58 },
    fastTravel: true,
    exits: [
      { id: 'belvedere-boulevard', direction: 'west', targetId: '1,2', trigger: { x: 48, y: 59 }, arrival: { x: 46, y: 59 } },
    ],
  },
];

const DEFINITIONS_BY_ID = new Map<LocationId, LocationDefinition>(
  DEFINITIONS.map((definition) => [definition.id, definition]),
);

export const LOCATION_DEFINITIONS: readonly LocationDefinition[] = DEFINITIONS;

export function locationIdForSector(sx: number, sy: number): LocationId | string {
  return sectorKey(sx, sy);
}

export function locationIdForPosition(position: Position): LocationId | string {
  return locationIdForSector(globalToSector(position.x), globalToSector(position.y));
}

export function locationForId(id: LocationId | string): LocationDefinition | null {
  return DEFINITIONS_BY_ID.get(id as LocationId) ?? null;
}

export function locationForPosition(position: Position): WorldLocation {
  const sx = globalToSector(position.x);
  const sy = globalToSector(position.y);
  const id = locationIdForSector(sx, sy);
  const definition = locationForId(id);
  return {
    id,
    sx,
    sy,
    name: definition?.name ?? `Settore ${sx},${sy}`,
  };
}

export function exitsForLocation(id: LocationId | string): readonly LocationExit[] {
  return locationForId(id)?.exits ?? [];
}

export function fastTravelLocations(): LocationDefinition[] {
  return DEFINITIONS.filter((definition) => definition.fastTravel);
}

export function targetName(exit: LocationExit): string {
  return locationForId(exit.targetId)?.name ?? exit.targetId;
}
