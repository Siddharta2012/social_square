import { Direction } from '@social-square/shared';
import { z } from 'zod';

const avatarConfigSchema = z.object({
  userId: z.string().max(80).optional(),
  username: z.string().trim().min(1).max(30).optional(),
  body: z.number().finite().optional(),
  outfit: z.number().finite().optional(),
  hair: z.number().finite().optional(),
  hairColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  accessory: z.number().finite().optional(),
  expression: z.number().finite().optional(),
}).passthrough();

export const joinRoomSchema = z.object({
  roomId: z.string().trim().min(1).max(64),
  avatarConfig: avatarConfigSchema.default({}),
});

export const avatarUpdateSchema = z.object({
  avatarConfig: avatarConfigSchema.default({}),
});

export const moveSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  direction: z.nativeEnum(Direction),
  state: z.enum(['idle', 'walk', 'sit', 'wave', 'dance', 'clap', 'fish']),
});

export const interactSchema = z.object({
  objectId: z.string().trim().min(1).max(80),
  action: z.string().trim().min(1).max(80),
  payload: z.record(z.unknown()).optional().default({}),
});

export const emoteSchema = z.object({
  emoteId: z.enum(['wave', 'dance', 'clap']),
});

export const chatMessageSchema = z.object({
  text: z.string().max(500),
});

export const whisperMessageSchema = z.object({
  toUserId: z.string().trim().min(1).max(80),
  text: z.string().max(500),
});

export const holdItemSchema = z.object({
  item: z.enum(['beer', 'pretzel']).nullable(),
});
