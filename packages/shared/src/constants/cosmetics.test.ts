import { describe, expect, it } from 'vitest';
import { cosmeticById, ownsAvatarConfig, type CosmeticItem } from './cosmetics';
import type { AvatarConfig } from '../types/events';

function avatar(patch: Partial<AvatarConfig> = {}): AvatarConfig {
  return {
    userId: 'u',
    username: 'User',
    body: 0,
    outfit: 0,
    hair: 0,
    hairColor: '#4488ff',
    accessory: 0,
    expression: 0,
    ...patch,
  };
}

describe('cosmetics catalog', () => {
  it('finds catalog entries by id', () => {
    expect(cosmeticById('avatar:outfit:1')).toMatchObject<Partial<CosmeticItem>>({
      kind: 'avatar',
      price: 300,
    });
  });

  it('allows free defaults and gates locked avatar parts', () => {
    expect(ownsAvatarConfig(avatar(), [])).toBe(true);
    expect(ownsAvatarConfig(avatar({ outfit: 1 }), [])).toBe(false);
    expect(ownsAvatarConfig(avatar({ outfit: 1 }), ['avatar:outfit:1'])).toBe(true);
  });
});
