import jwt from 'jsonwebtoken';
import type { Socket } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData } from '@social-square/shared';

type IoSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;

const JWT_SECRET = process.env.JWT_SECRET ?? 'dev-secret-change-in-prod';

interface JwtPayload {
  userId: string;
  username: string;
}

export function socketAuthMiddleware(
  socket: IoSocket,
  next: (err?: Error) => void,
): void {
  const { token, username: legacyUsername } = socket.handshake.auth as {
    token?: string;
    username?: string;
  };

  // JWT path (Block B+)
  if (token) {
    try {
      const payload = jwt.verify(token, JWT_SECRET) as JwtPayload;
      socket.data.userId = payload.userId;
      socket.data.username = payload.username;
      return next();
    } catch {
      return next(new Error('TOKEN_INVALID'));
    }
  }

  // Legacy path: plain username (Block A — kept for backwards compat during transition)
  if (legacyUsername && typeof legacyUsername === 'string') {
    const trimmed = legacyUsername.trim();
    if (trimmed.length >= 2 && trimmed.length <= 30) {
      socket.data.userId = socket.id;
      socket.data.username = trimmed;
      return next();
    }
  }

  next(new Error('AUTH_REQUIRED'));
}
