import { describe, expect, it } from 'vitest';
import { moderateChatText } from './ModerationService';

describe('chat moderation', () => {
  it('strips HTML-like characters before broadcasting chat', () => {
    expect(moderateChatText('  <b>ciao</b>  ')).toMatchObject({
      ok: true,
      text: 'bciao/b',
    });
  });

  it('rejects disallowed abusive content', () => {
    expect(moderateChatText('sei un idiota')).toMatchObject({
      ok: false,
      code: 'CHAT_REJECTED',
    });
  });
});
