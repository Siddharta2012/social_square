export type ProgressActivity = 'chat' | 'petal';

export interface DailyQuestState {
  date: string;
  presenceClaimed: boolean;
  chatMessages: number;
  petalsCollected: number;
  rewardedQuestIds: string[];
}

export interface DailyQuestDefinition {
  id: 'chat-3' | 'petal-5';
  activity: ProgressActivity;
  target: number;
  petalReward: number;
  xpReward: number;
  label: string;
}

export interface UserProgressSnapshot {
  xp: number;
  level: number;
  currentLevelXp: number;
  nextLevelXp: number;
  streakDays: number;
  lastPresenceClaimAt: number | null;
  daily: DailyQuestState;
}

export const DAILY_PRESENCE_XP = 75;
export const CHAT_ACTIVITY_XP = 5;
export const PETAL_ACTIVITY_XP = 4;
export const MAX_STREAK_BONUS_PETALS = 150;

export const DAILY_QUESTS: DailyQuestDefinition[] = [
  {
    id: 'chat-3',
    activity: 'chat',
    target: 3,
    petalReward: 25,
    xpReward: 30,
    label: 'Scrivi 3 messaggi',
  },
  {
    id: 'petal-5',
    activity: 'petal',
    target: 5,
    petalReward: 35,
    xpReward: 35,
    label: 'Raccogli 5 fiori',
  },
];

export function dayKey(value = Date.now()): string {
  return new Date(value).toISOString().slice(0, 10);
}

export function previousDayKey(value = Date.now()): string {
  return dayKey(value - 24 * 60 * 60 * 1000);
}

export function startOfNextUtcDay(value = Date.now()): number {
  const now = new Date(value);
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
}

export function levelForXp(xp: number): number {
  const safeXp = Math.max(0, Math.trunc(xp));
  return Math.floor(Math.sqrt(safeXp / 100)) + 1;
}

export function currentLevelXp(level: number): number {
  const safeLevel = Math.max(1, Math.trunc(level));
  return (safeLevel - 1) * (safeLevel - 1) * 100;
}

export function nextLevelXp(level: number): number {
  const safeLevel = Math.max(1, Math.trunc(level));
  return safeLevel * safeLevel * 100;
}

export function streakPetalReward(baseReward: number, streakDays: number): number {
  const bonus = Math.min(MAX_STREAK_BONUS_PETALS, Math.max(0, Math.trunc(streakDays) - 1) * 15);
  return Math.max(0, Math.trunc(baseReward)) + bonus;
}

export function emptyDailyQuestState(date = dayKey()): DailyQuestState {
  return {
    date,
    presenceClaimed: false,
    chatMessages: 0,
    petalsCollected: 0,
    rewardedQuestIds: [],
  };
}

export function normalizeDailyQuestState(raw: unknown, date = dayKey()): DailyQuestState {
  if (!raw || typeof raw !== 'object') return emptyDailyQuestState(date);
  const value = raw as Partial<DailyQuestState>;
  if (value.date !== date) return emptyDailyQuestState(date);
  return {
    date,
    presenceClaimed: value.presenceClaimed === true,
    chatMessages: Math.max(0, Math.trunc(value.chatMessages ?? 0)),
    petalsCollected: Math.max(0, Math.trunc(value.petalsCollected ?? 0)),
    rewardedQuestIds: Array.isArray(value.rewardedQuestIds)
      ? value.rewardedQuestIds.filter((item): item is string => typeof item === 'string')
      : [],
  };
}

export function questProgress(daily: DailyQuestState, quest: DailyQuestDefinition): number {
  return quest.activity === 'chat' ? daily.chatMessages : daily.petalsCollected;
}
