import { randomBytes } from 'node:crypto';
import { privateRoomCode } from '@social-square/shared';
import { query } from '../config/database';

export interface PrivateRoomSummary {
  roomId: string;
  code: string;
  name: string;
}

interface RoomRow {
  id: string;
  name: string;
  config: unknown;
}

interface PrivateRoomConfig {
  private: true;
  inviteCode: string;
  ownerId: string;
  members: string[];
  createdAt: number;
}

function codeFromBytes(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = randomBytes(6);
  return [...bytes].map((byte) => alphabet[byte % alphabet.length]).join('');
}

function parseConfig(raw: unknown): PrivateRoomConfig | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Partial<PrivateRoomConfig>;
  if (value.private !== true || typeof value.inviteCode !== 'string' || typeof value.ownerId !== 'string') return null;
  return {
    private: true,
    inviteCode: value.inviteCode,
    ownerId: value.ownerId,
    members: Array.isArray(value.members)
      ? value.members.filter((member): member is string => typeof member === 'string')
      : [],
    createdAt: typeof value.createdAt === 'number' ? value.createdAt : Date.now(),
  };
}

export class PrivateRoomService {
  async create(ownerId: string): Promise<PrivateRoomSummary> {
    for (let attempt = 0; attempt < 8; attempt++) {
      const code = codeFromBytes();
      const roomId = `private:${code}`;
      const config: PrivateRoomConfig = {
        private: true,
        inviteCode: code,
        ownerId,
        members: [ownerId],
        createdAt: Date.now(),
      };
      const inserted = await query<RoomRow>(
        `
          INSERT INTO rooms (id, name, description, max_users, is_active, config)
          VALUES ($1, $2, 'Stanza privata con invito', 8, TRUE, $3::jsonb)
          ON CONFLICT (id) DO NOTHING
          RETURNING id, name, config
        `,
        [roomId, `Stanza privata ${code}`, JSON.stringify(config)],
      );
      if (inserted.rows[0]) return { roomId, code, name: inserted.rows[0].name };
    }
    throw new Error('PRIVATE_ROOM_CODE_EXHAUSTED');
  }

  async joinByCode(userId: string, codeInput: string): Promise<PrivateRoomSummary | null> {
    const code = codeInput.trim().toUpperCase();
    if (!/^[A-Z0-9]{6}$/.test(code)) return null;
    const roomId = `private:${code}`;
    const result = await query<RoomRow>('SELECT id, name, config FROM rooms WHERE id = $1 AND is_active = TRUE', [roomId]);
    const row = result.rows[0];
    const config = row ? parseConfig(row.config) : null;
    if (!row || !config) return null;
    const members = [...new Set([...config.members, userId])];
    await query(
      `
        UPDATE rooms
        SET config = jsonb_set(config, '{members}', $2::jsonb, true)
        WHERE id = $1
      `,
      [roomId, JSON.stringify(members)],
    );
    return { roomId, code, name: row.name };
  }

  async canJoin(userId: string, roomId: string): Promise<boolean> {
    const code = privateRoomCode(roomId);
    if (!code) return true;
    const result = await query<RoomRow>('SELECT config FROM rooms WHERE id = $1 AND is_active = TRUE', [roomId]);
    const config = result.rows[0] ? parseConfig(result.rows[0].config) : null;
    return Boolean(config?.members.includes(userId));
  }
}

export const privateRoomService = new PrivateRoomService();
