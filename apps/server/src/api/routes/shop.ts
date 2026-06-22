import { COSMETIC_CATALOG, cosmeticById } from '@social-square/shared';
import express, { RequestHandler } from 'express';
import { UserService } from '../../services/UserService';
import { userFromAuthHeader } from '../authenticate';
import type { AvatarConfig } from '@social-square/shared';

const router: express.Router = express.Router();
const userService = new UserService();

function avatarFor(userId: string, username: string, existing?: AvatarConfig): AvatarConfig {
  return existing ?? {
    userId,
    username,
    body: 0,
    outfit: 0,
    hair: 0,
    hairColor: '#4488ff',
    accessory: 0,
    expression: 0,
  };
}

const catalogHandler: RequestHandler = (_req, res) => {
  res.json({ items: COSMETIC_CATALOG });
};

const purchaseHandler: RequestHandler = async (req, res) => {
  const user = await userFromAuthHeader(req);
  if (!user) {
    res.status(401).json({ error: 'AUTH_REQUIRED' });
    return;
  }
  const itemId = typeof req.body?.itemId === 'string' ? req.body.itemId : '';
  const requestId = typeof req.body?.requestId === 'string' ? req.body.requestId : `shop:${itemId}:${Date.now()}`;
  if (!cosmeticById(itemId)) {
    res.status(404).json({ error: 'COSMETIC_NOT_FOUND' });
    return;
  }
  const updated = await userService.purchaseCosmetic(user.userId, itemId, `shop:${requestId}`);
  if (!updated) {
    res.status(402).json({ error: 'INSUFFICIENT_PETALS' });
    return;
  }
  res.json({
    petals: updated.petals,
    unlockedItems: updated.unlockedItems,
    stats: updated.stats,
  });
};

const equipHandler: RequestHandler = async (req, res) => {
  const user = await userFromAuthHeader(req);
  if (!user) {
    res.status(401).json({ error: 'AUTH_REQUIRED' });
    return;
  }
  const itemId = typeof req.body?.itemId === 'string' ? req.body.itemId : '';
  const item = cosmeticById(itemId);
  if (!item?.avatarPatch) {
    res.status(404).json({ error: 'COSMETIC_NOT_EQUIPPABLE' });
    return;
  }
  if (!user.unlockedItems.includes(item.id)) {
    res.status(403).json({ error: 'COSMETIC_LOCKED' });
    return;
  }
  const avatarConfig = {
    ...avatarFor(user.userId, user.username, user.avatarConfig),
    ...item.avatarPatch,
    userId: user.userId,
    username: user.username,
  };
  const updated = await userService.updateAvatarConfig(user.userId, avatarConfig);
  res.json({
    avatarConfig: updated?.avatarConfig ?? avatarConfig,
    unlockedItems: updated?.unlockedItems ?? user.unlockedItems,
  });
};

router.get('/catalog', catalogHandler);
router.post('/purchase', purchaseHandler);
router.post('/equip', equipHandler);

export { router as shopRouter };
