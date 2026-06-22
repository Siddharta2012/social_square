import { query } from '../config/database';
import { ModerationService, moderationService } from './ModerationService';
import { StateService } from './StateService';
import { UserService } from './UserService';

export interface FriendSummary {
  userId: string;
  username: string;
  status: 'pending_incoming' | 'pending_outgoing' | 'accepted';
  online: boolean;
  roomId: string | null;
}

interface FriendshipRow {
  requester_id: string;
  addressee_id: string;
  status: 'pending' | 'accepted' | 'rejected';
  requester_username: string;
  addressee_username: string;
}

export class SocialService {
  constructor(
    private readonly userService = new UserService(),
    private readonly state = new StateService(),
    private readonly moderation: ModerationService = moderationService,
  ) {}

  async sendFriendRequest(requesterId: string, targetUserId: string): Promise<FriendSummary | null> {
    if (requesterId === targetUserId) return null;
    const [requester, target] = await Promise.all([
      this.userService.findById(requesterId),
      this.userService.findById(targetUserId),
    ]);
    if (!requester || !target) return null;
    if (await this.moderation.hasEitherBlock(requesterId, targetUserId)) return null;

    const reverse = await query<FriendshipRow>(
      `
        SELECT f.*, requester.username AS requester_username, addressee.username AS addressee_username
        FROM friendships f
        JOIN users requester ON requester.id = f.requester_id
        JOIN users addressee ON addressee.id = f.addressee_id
        WHERE requester_id = $1 AND addressee_id = $2
        LIMIT 1
      `,
      [targetUserId, requesterId],
    );
    if (reverse.rows[0]?.status === 'pending') {
      await this.acceptFriendRequest(requesterId, targetUserId);
      return this.summaryFor(targetUserId, 'accepted');
    }

    await query(
      `
        INSERT INTO friendships (requester_id, addressee_id, status)
        VALUES ($1, $2, 'pending')
        ON CONFLICT (requester_id, addressee_id)
        DO UPDATE SET status = CASE
          WHEN friendships.status = 'accepted' THEN 'accepted'
          ELSE 'pending'
        END, updated_at = NOW()
      `,
      [requesterId, targetUserId],
    );
    return this.summaryFor(targetUserId, 'pending_outgoing');
  }

  async acceptFriendRequest(userId: string, requesterId: string): Promise<boolean> {
    const result = await query(
      `
        UPDATE friendships
        SET status = 'accepted', updated_at = NOW()
        WHERE requester_id = $1 AND addressee_id = $2 AND status = 'pending'
      `,
      [requesterId, userId],
    );
    return result.rowCount !== null && result.rowCount > 0;
  }

  async rejectFriendRequest(userId: string, requesterId: string): Promise<boolean> {
    const result = await query(
      `
        UPDATE friendships
        SET status = 'rejected', updated_at = NOW()
        WHERE requester_id = $1 AND addressee_id = $2 AND status = 'pending'
      `,
      [requesterId, userId],
    );
    return result.rowCount !== null && result.rowCount > 0;
  }

  async areFriends(firstUserId: string, secondUserId: string): Promise<boolean> {
    const result = await query(
      `
        SELECT 1
        FROM friendships
        WHERE status = 'accepted'
          AND (
            (requester_id = $1 AND addressee_id = $2)
            OR (requester_id = $2 AND addressee_id = $1)
          )
        LIMIT 1
      `,
      [firstUserId, secondUserId],
    );
    return result.rowCount !== null && result.rowCount > 0;
  }

  async listFriends(userId: string): Promise<FriendSummary[]> {
    const rows = await query<FriendshipRow>(
      `
        SELECT f.*, requester.username AS requester_username, addressee.username AS addressee_username
        FROM friendships f
        JOIN users requester ON requester.id = f.requester_id
        JOIN users addressee ON addressee.id = f.addressee_id
        WHERE requester_id = $1 OR addressee_id = $1
        ORDER BY f.updated_at DESC
      `,
      [userId],
    );
    return Promise.all(rows.rows
      .filter((row) => row.status !== 'rejected')
      .map(async (row) => {
        const isRequester = row.requester_id === userId;
        const friendId = isRequester ? row.addressee_id : row.requester_id;
        const presence = await this.state.findUserPresence(friendId);
        return {
          userId: friendId,
          username: isRequester ? row.addressee_username : row.requester_username,
          status: row.status === 'accepted'
            ? 'accepted'
            : isRequester ? 'pending_outgoing' : 'pending_incoming',
          online: Boolean(presence),
          roomId: presence?.roomId ?? null,
        };
      }));
  }

  private async summaryFor(
    friendId: string,
    status: FriendSummary['status'],
  ): Promise<FriendSummary | null> {
    const friend = await this.userService.findById(friendId);
    if (!friend) return null;
    const presence = await this.state.findUserPresence(friendId);
    return {
      userId: friend.userId,
      username: friend.username,
      status,
      online: Boolean(presence),
      roomId: presence?.roomId ?? null,
    };
  }
}

export const socialService = new SocialService();
