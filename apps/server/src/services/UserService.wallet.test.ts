import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { UserService } from './UserService';
import { MemoryUserRepository } from './UserService.testSupport';

async function createUser() {
  const repository = new MemoryUserRepository();
  const service = new UserService(repository);
  const sub = `wallet-${randomUUID()}`;
  const { user } = await service.loginOrCreateGoogleUser({
    sub,
    email: `${sub}@example.test`,
    name: 'Wallet Tester',
  });
  return { repository, service, user };
}

describe('UserService wallet', () => {
  it('rejects insufficient petal spends and records successful economy stats', async () => {
    const { service, user } = await createUser();

    await expect(service.spendPetals(user.userId, 100, 'jukebox', 'spend:too-much')).resolves.toBeNull();

    const funded = await service.awardPetals(user.userId, 250, 'flower', 'award:flower');
    expect(funded?.petals).toBe(250);
    expect(funded?.stats.flowerPetalsCollected).toBe(1);

    const afterJukebox = await service.spendPetals(user.userId, 200, 'jukebox', 'spend:jukebox');
    expect(afterJukebox?.petals).toBe(50);
    expect(afterJukebox?.stats.petalsSpent).toBe(200);
    expect(afterJukebox?.stats.jukeboxPlays).toBe(1);

    await expect(service.spendPetals(user.userId, 100, 'waiter', 'spend:waiter-fail')).resolves.toBeNull();

    const toppedUp = await service.awardPetals(user.userId, 200, 'event', 'award:event');
    expect(toppedUp?.petals).toBe(250);
    const afterPool = await service.spendPetals(user.userId, 200, 'pool', 'spend:pool');
    expect(afterPool?.petals).toBe(50);
    expect(afterPool?.stats.poolPlays).toBe(1);
  });

  it('applies a duplicated idempotency key only once', async () => {
    const { service, user } = await createUser();

    const firstAward = await service.awardPetals(user.userId, 100, 'flower', 'flower:one');
    const replayedAward = await service.awardPetals(user.userId, 100, 'flower', 'flower:one');
    expect(firstAward?.petals).toBe(100);
    expect(replayedAward?.petals).toBe(100);

    const firstSpend = await service.spendPetals(user.userId, 40, 'counter', 'counter:one');
    const replayedSpend = await service.spendPetals(user.userId, 40, 'counter', 'counter:one');
    expect(firstSpend?.petals).toBe(60);
    expect(replayedSpend?.petals).toBe(60);

    await expect(service.walletInvariant(user.userId)).resolves.toEqual({
      userPetals: 60,
      ledgerSum: 60,
    });
  });

  it('keeps 100 concurrent wallet operations arithmetically exact', async () => {
    const { service, user } = await createUser();

    await service.awardPetals(user.userId, 1_000, 'admin', 'seed');
    const operations = [
      ...Array.from({ length: 60 }, (_, index) =>
        service.awardPetals(user.userId, 3, 'task', `task:${index}`),
      ),
      ...Array.from({ length: 40 }, (_, index) =>
        service.spendPetals(user.userId, 2, 'jukebox', `jukebox:${index}`),
      ),
    ];

    await Promise.all(operations);

    const userAfter = await service.findById(user.userId);
    expect(userAfter?.petals).toBe(1_100);
    await expect(service.walletInvariant(user.userId)).resolves.toEqual({
      userPetals: 1_100,
      ledgerSum: 1_100,
    });
  });

  it('never lets the balance go negative', async () => {
    const { service, user } = await createUser();

    await service.awardPetals(user.userId, 25, 'admin', 'seed');
    await expect(service.spendPetals(user.userId, 26, 'pool', 'pool:too-much')).resolves.toBeNull();
    await expect(service.walletInvariant(user.userId)).resolves.toEqual({
      userPetals: 25,
      ledgerSum: 25,
    });
  });

  it('buys a cosmetic once with an idempotent ledger spend', async () => {
    const { service, user } = await createUser();

    await service.awardPetals(user.userId, 500, 'admin', 'seed');
    const first = await service.purchaseCosmetic(user.userId, 'avatar:outfit:1', 'shop:outfit');
    const replay = await service.purchaseCosmetic(user.userId, 'avatar:outfit:1', 'shop:outfit');

    expect(first?.petals).toBe(200);
    expect(replay?.petals).toBe(200);
    expect(replay?.unlockedItems).toContain('avatar:outfit:1');
    await expect(service.walletInvariant(user.userId)).resolves.toEqual({
      userPetals: 200,
      ledgerSum: 200,
    });
  });

  it('does not write while reading a profile', async () => {
    const { repository, service, user } = await createUser();
    repository.resetWriteCount();

    await expect(service.findById(user.userId)).resolves.toMatchObject({ userId: user.userId });

    expect(repository.writeCount).toBe(0);
  });

  it('repairs a stale zero petal balance from the wallet ledger', async () => {
    const { repository, service, user } = await createUser();

    await service.awardPetals(user.userId, 125, 'flower', 'award:repair-source');
    const stored = repository.users.get(user.userId);
    expect(stored).toBeDefined();
    repository.users.set(user.userId, { ...stored!, petals: 0 });

    await expect(service.findById(user.userId)).resolves.toMatchObject({ petals: 125 });
    await expect(service.walletInvariant(user.userId)).resolves.toEqual({
      userPetals: 125,
      ledgerSum: 125,
    });
  });
});
