import type { AvatarConfig } from '../types/events';

export type CosmeticKind = 'avatar' | 'emote' | 'title' | 'decoration';

export interface CosmeticItem {
  id: string;
  kind: CosmeticKind;
  label: string;
  price: number;
  avatarPatch?: Partial<Pick<AvatarConfig, 'body' | 'outfit' | 'hair' | 'accessory' | 'expression'>>;
}

export const FREE_COSMETIC_IDS = new Set([
  'avatar:body:0',
  'avatar:outfit:0',
  'avatar:hair:0',
  'avatar:accessory:0',
  'avatar:expression:0',
]);

export const COSMETIC_CATALOG: CosmeticItem[] = [
  { id: 'avatar:outfit:1', kind: 'avatar', label: 'Giacca smeraldo', price: 300, avatarPatch: { outfit: 1 } },
  { id: 'avatar:hair:1', kind: 'avatar', label: 'Taglio notte', price: 220, avatarPatch: { hair: 1 } },
  { id: 'avatar:accessory:1', kind: 'avatar', label: 'Occhiali neon', price: 260, avatarPatch: { accessory: 1 } },
  { id: 'avatar:expression:1', kind: 'avatar', label: 'Sorriso sicuro', price: 180, avatarPatch: { expression: 1 } },
  { id: 'title:regular', kind: 'title', label: 'Cliente abituale', price: 500 },
  { id: 'decoration:plant:1', kind: 'decoration', label: 'Pianta da tavolo', price: 420 },
];

export function cosmeticById(id: string): CosmeticItem | undefined {
  return COSMETIC_CATALOG.find((item) => item.id === id);
}

export function avatarCosmeticIds(config: Pick<AvatarConfig, 'body' | 'outfit' | 'hair' | 'accessory' | 'expression'>): string[] {
  return [
    `avatar:body:${Math.max(0, Math.trunc(config.body))}`,
    `avatar:outfit:${Math.max(0, Math.trunc(config.outfit))}`,
    `avatar:hair:${Math.max(0, Math.trunc(config.hair))}`,
    `avatar:accessory:${Math.max(0, Math.trunc(config.accessory))}`,
    `avatar:expression:${Math.max(0, Math.trunc(config.expression))}`,
  ];
}

export function ownsAvatarConfig(config: AvatarConfig, unlockedItems: readonly string[]): boolean {
  const owned = new Set([...FREE_COSMETIC_IDS, ...unlockedItems]);
  return avatarCosmeticIds(config).every((id) => owned.has(id));
}
