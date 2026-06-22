import type { RoomConfig } from '../types/room';

export const ROOM_CONFIGS: Record<string, RoomConfig> = {
  mall: {
    id: 'mall',
    name: 'Centro Commerciale',
    description: 'Negozi, fontane e musica pop. Il posto perfetto per fare shopping virtuale.',
    maxUsers: 30,
    spawnPoints: [
      { x: 12, y: 19 },
      { x: 10, y: 19 },
      { x: 14, y: 19 },
    ],
  },
  bar: {
    id: 'bar',
    name: 'Bar',
    description: 'Bancone, tavolini e jukebox.',
    maxUsers: 20,
    spawnPoints: [{ x: 9, y: 15 }],
  },
  park: {
    id: 'park',
    name: 'Picnic al Parco',
    description: 'Coperte, alberi e giochi.',
    maxUsers: 25,
    spawnPoints: [{ x: 14, y: 23 }],
  },
  lake: {
    id: 'lake',
    name: 'Pesca al Lago',
    description: 'Pontile, lago e tramonto.',
    maxUsers: 20,
    spawnPoints: [{ x: 13, y: 21 }],
  },
};

export function privateRoomCode(roomId: string): string | null {
  const match = /^private:([A-Z0-9]{6})$/.exec(roomId);
  return match?.[1] ?? null;
}

export function roomConfigForId(roomId: string): RoomConfig | null {
  const config = ROOM_CONFIGS[roomId];
  if (config) return config;
  const code = privateRoomCode(roomId);
  if (!code) return null;
  return {
    ...ROOM_CONFIGS.bar,
    id: roomId,
    name: `Stanza privata ${code}`,
    description: 'Istanza privata del bar accessibile con invito.',
    maxUsers: 8,
  };
}
