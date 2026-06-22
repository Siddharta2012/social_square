import jwt from 'jsonwebtoken';
import { env } from '../../config/env';
import { UserService } from '../../services/UserService';
import type { ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData } from '@social-square/shared';
import type { Socket } from 'socket.io';

type IoSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;

interface JwtPayload {
  userId: string;
  username: string;
  tokenVersion: number;
}

const userService = new UserService();

export function socketAuthMiddleware(
  socket: IoSocket,
  next: (err?: Error) => void,
): void {
  void authenticateSocket(socket, next);
}

async function authenticateSocket(
  socket: IoSocket,
  next: (err?: Error) => void,
): Promise<void> {
  const { token, username: legacyUsername } = socket.handshake.auth as {
    token?: string;
    username?: string;
  };

  if (token) {
    try {
      const payload = jwt.verify(token, env.JWT_SECRET) as JwtPayload;
      const user = await userService.findById(payload.userId);
      if (!user || user.tokenVersion !== payload.tokenVersion) return next(new Error('TOKEN_REVOKED'));
      socket.data.userId = user.userId;
      socket.data.username = user.username;
      return next();
    } catch {
      return next(new Error('TOKEN_INVALID'));
    }
  }

  if (env.NODE_ENV !== 'production' && env.ALLOW_LEGACY_SOCKET_AUTH && legacyUsername && typeof legacyUsername === 'string') {
    const trimmed = legacyUsername.trim();
    if (trimmed.length >= 2 && trimmed.length <= 30) {
      socket.data.userId = socket.id;
      socket.data.username = trimmed;
      return next();
    }
  }

  return next(new Error('AUTH_REQUIRED'));
}
