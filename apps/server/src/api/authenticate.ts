import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { UserService, type StoredUser } from '../services/UserService';
import type express from 'express';

interface JwtPayload {
  userId: string;
  tokenVersion: number;
}

const userService = new UserService();

export async function userFromAuthHeader(req: express.Request): Promise<StoredUser | null> {
  const auth = req.headers.authorization;
  const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return null;

  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as JwtPayload;
    const user = await userService.findById(payload.userId);
    if (!user || user.tokenVersion !== payload.tokenVersion) return null;
    return user;
  } catch {
    return null;
  }
}
