import type { AccountStats } from './account';
import type { AvatarConfig, CosmeticItem } from '@social-square/shared';

function requestId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}:${Math.random().toString(36).slice(2)}`;
}

export async function fetchShopCatalog(): Promise<CosmeticItem[]> {
  const res = await fetch('/api/shop/catalog');
  if (!res.ok) return [];
  const data = await res.json() as { items?: CosmeticItem[] };
  return Array.isArray(data.items) ? data.items : [];
}

export async function purchaseCosmetic(
  token: string,
  itemId: string,
): Promise<{ petals: number; unlockedItems: string[]; stats: AccountStats } | null> {
  const res = await fetch('/api/shop/purchase', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ itemId, requestId: `shop:${itemId}:${requestId()}` }),
  });
  if (!res.ok) return null;
  return res.json() as Promise<{ petals: number; unlockedItems: string[]; stats: AccountStats }>;
}

export async function equipCosmetic(
  token: string,
  itemId: string,
): Promise<{ avatarConfig: AvatarConfig; unlockedItems: string[] } | null> {
  const res = await fetch('/api/shop/equip', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ itemId }),
  });
  if (!res.ok) return null;
  return res.json() as Promise<{ avatarConfig: AvatarConfig; unlockedItems: string[] }>;
}
