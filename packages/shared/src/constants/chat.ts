export const CHAT_MAX_LENGTH = 160;
export const CHAT_HISTORY_LIMIT = 24;

export interface ChatMessage {
  id: string;
  roomId: string;
  userId: string;
  username: string;
  text: string;
  sentAt: number;
}

export function normalizeChatText(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.replace(/\s+/g, ' ').trim().slice(0, CHAT_MAX_LENGTH);
}
