import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { UserService } from './UserService';

describe('UserService wallet', () => {
  it('rejects insufficient petal spends and records successful economy stats', async () => {
    const service = new UserService();
    const sub = `wallet-${randomUUID()}`;
    const { user } = await service.loginOrCreateGoogleUser({
      sub,
      email: `${sub}@example.test`,
      name: 'Wallet Tester',
    });

    await expect(service.spendPetals(user.userId, 100, 'jukebox')).resolves.toBeNull();

    const funded = await service.awardPetals(user.userId, 250, 'flower');
    expect(funded?.petals).toBe(250);
    expect(funded?.stats.flowerPetalsCollected).toBe(1);

    const afterJukebox = await service.spendPetals(user.userId, 200, 'jukebox');
    expect(afterJukebox?.petals).toBe(50);
    expect(afterJukebox?.stats.petalsSpent).toBe(200);
    expect(afterJukebox?.stats.jukeboxPlays).toBe(1);

    await expect(service.spendPetals(user.userId, 100, 'waiter')).resolves.toBeNull();
  });
});
