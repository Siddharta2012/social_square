import { describe, expect, it } from 'vitest';
import {
  emptyDailyQuestState,
  levelForXp,
  nextLevelXp,
  normalizeDailyQuestState,
  questProgress,
  streakPetalReward,
  DAILY_QUESTS,
} from './progression';

describe('progression', () => {
  it('calculates stable level thresholds', () => {
    expect(levelForXp(0)).toBe(1);
    expect(levelForXp(99)).toBe(1);
    expect(levelForXp(100)).toBe(2);
    expect(nextLevelXp(2)).toBe(400);
  });

  it('resets daily quest state across UTC days', () => {
    const today = normalizeDailyQuestState({ date: '2026-06-22', chatMessages: 3 }, '2026-06-22');
    expect(questProgress(today, DAILY_QUESTS[0])).toBe(3);

    const tomorrow = normalizeDailyQuestState(today, '2026-06-23');
    expect(tomorrow).toEqual(emptyDailyQuestState('2026-06-23'));
  });

  it('caps streak petal bonus', () => {
    expect(streakPetalReward(100, 1)).toBe(100);
    expect(streakPetalReward(100, 4)).toBe(145);
    expect(streakPetalReward(100, 99)).toBe(250);
  });
});
