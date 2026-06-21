export interface RoomConfig {
  id: string;
  name: string;
  description: string;
  maxUsers: number;
  spawnPoints: Array<{ x: number; y: number }>;
}

export type RoomId = 'mall' | 'bar' | 'park' | 'lake';
