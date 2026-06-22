import { AccessToken } from 'livekit-server-sdk';
import { env } from '../config/env';

export function isLiveKitConfigured(): boolean {
  return env.LIVEKIT_CONFIGURED;
}

export async function generateVoiceToken(userId: string, username: string, roomId: string): Promise<string> {
  const token = new AccessToken(env.LIVEKIT_API_KEY ?? '', env.LIVEKIT_API_SECRET ?? '', {
    identity: userId,
    name: username,
    ttl: '4h',
  });

  token.addGrant({
    roomJoin: true,
    room: roomId,
    canPublish: true,
    canSubscribe: true,
    canPublishData: false,
  });

  return token.toJwt();
}
