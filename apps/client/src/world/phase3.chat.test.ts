import { describe, expect, it } from 'vitest';
import { CHAT_HISTORY_LIMIT, CHAT_MAX_LENGTH, normalizeChatText, type ChatMessage } from '@social-square/shared';
import { useGameStore } from '../store/gameStore';

function message(index: number): ChatMessage {
  return {
    id: `m-${index}`,
    roomId: 'bar',
    userId: `u-${index}`,
    username: `User ${index}`,
    text: `Message ${index}`,
    sentAt: index,
  };
}

describe('phase 3 chat', () => {
  it('normalizes whitespace and caps message length', () => {
    const longText = `  hello     square   ${'x'.repeat(200)}`;
    const normalized = normalizeChatText(longText);
    expect(normalized.startsWith('hello square')).toBe(true);
    expect(normalized.length).toBe(CHAT_MAX_LENGTH);
  });

  it('keeps only the recent chat history in the HUD store', () => {
    const store = useGameStore.getState();
    store.clearChatMessages();

    for (let i = 0; i < CHAT_HISTORY_LIMIT + 4; i++) {
      useGameStore.getState().addChatMessage(message(i));
    }

    const history = useGameStore.getState().chatMessages;
    expect(history).toHaveLength(CHAT_HISTORY_LIMIT);
    expect(history[0].id).toBe('m-4');
    expect(history[history.length - 1].id).toBe(`m-${CHAT_HISTORY_LIMIT + 3}`);

    useGameStore.getState().clearChatMessages();
  });
});
