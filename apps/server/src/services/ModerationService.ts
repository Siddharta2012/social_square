import { query } from '../config/database';

const DISALLOWED_PATTERNS = [
  /\b(idiota|stupido|cretino)\b/i,
  /\b(kill yourself|kys)\b/i,
];

export interface ModerationResult {
  ok: boolean;
  text: string;
  code?: string;
}

export function moderateChatText(input: string): ModerationResult {
  const withoutControlChars = [...input].filter((char) => {
    const code = char.charCodeAt(0);
    return code >= 32 && code !== 127;
  }).join('');
  const text = withoutControlChars
    .replace(/[<>]/g, '')
    .trim()
    .slice(0, 500);
  if (!text) return { ok: false, text: '', code: 'CHAT_EMPTY' };
  if (DISALLOWED_PATTERNS.some((pattern) => pattern.test(text))) {
    return { ok: false, text, code: 'CHAT_REJECTED' };
  }
  return { ok: true, text };
}

export class ModerationService {
  async blockUser(blockerId: string, blockedId: string): Promise<void> {
    if (blockerId === blockedId) return;
    await query(
      `
        INSERT INTO user_blocks (blocker_id, blocked_id)
        VALUES ($1, $2)
        ON CONFLICT (blocker_id, blocked_id) DO NOTHING
      `,
      [blockerId, blockedId],
    );
    await this.audit(blockerId, blockedId, 'block');
  }

  async unblockUser(blockerId: string, blockedId: string): Promise<void> {
    await query('DELETE FROM user_blocks WHERE blocker_id = $1 AND blocked_id = $2', [blockerId, blockedId]);
    await this.audit(blockerId, blockedId, 'unblock');
  }

  async isBlockedBy(blockerId: string, blockedId: string): Promise<boolean> {
    const result = await query('SELECT 1 FROM user_blocks WHERE blocker_id = $1 AND blocked_id = $2 LIMIT 1', [
      blockerId,
      blockedId,
    ]);
    return result.rowCount !== null && result.rowCount > 0;
  }

  async hasEitherBlock(firstUserId: string, secondUserId: string): Promise<boolean> {
    const result = await query(
      `
        SELECT 1
        FROM user_blocks
        WHERE (blocker_id = $1 AND blocked_id = $2)
           OR (blocker_id = $2 AND blocked_id = $1)
        LIMIT 1
      `,
      [firstUserId, secondUserId],
    );
    return result.rowCount !== null && result.rowCount > 0;
  }

  async createReport(
    reporterId: string,
    reportedId: string | null,
    category: string,
    message: string,
    context: Record<string, unknown>,
  ): Promise<string | null> {
    const result = await query<{ id: string }>(
      `
        INSERT INTO moderation_reports (reporter_id, reported_id, category, message, context)
        VALUES ($1, $2, $3, $4, $5::jsonb)
        RETURNING id
      `,
      [reporterId, reportedId, category.slice(0, 40), message.slice(0, 1000), JSON.stringify(context)],
    );
    await this.audit(reporterId, reportedId, 'report', category);
    return result.rows[0]?.id ?? null;
  }

  async recentReports(limit = 50): Promise<unknown[]> {
    const result = await query(
      `
        SELECT id, reporter_id, reported_id, category, message, context, status, created_at
        FROM moderation_reports
        ORDER BY created_at DESC
        LIMIT $1
      `,
      [Math.max(1, Math.min(200, Math.trunc(limit)))],
    );
    return result.rows;
  }

  async audit(actorId: string | null, targetId: string | null, action: string, reason?: string): Promise<void> {
    await query(
      `
        INSERT INTO moderation_audit_log (actor_id, target_id, action, reason)
        VALUES ($1, $2, $3, $4)
      `,
      [actorId, targetId, action, reason ?? null],
    );
  }
}

export const moderationService = new ModerationService();
