import type { Position } from '@social-square/shared';
import { globalToSector, sectorKey } from './coords';

export interface WorldLocation {
  sx: number;
  sy: number;
  name: string;
}

const LOCATIONS = new Map<string, string>([
  [sectorKey(0, 0), 'Bar interno'],
  [sectorKey(0, 1), 'Bar giardino'],
  [sectorKey(1, 1), 'Piazza del paese'],
  [sectorKey(1, 0), 'Via delle botteghe'],
  [sectorKey(2, 0), 'Lungocanale'],
  [sectorKey(2, 1), 'Quartiere residenziale'],
]);

export function locationForPosition(position: Position): WorldLocation {
  const sx = globalToSector(position.x);
  const sy = globalToSector(position.y);
  return {
    sx,
    sy,
    name: LOCATIONS.get(sectorKey(sx, sy)) ?? `Settore ${sx},${sy}`,
  };
}
