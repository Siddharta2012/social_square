import { AccessToken } from 'livekit-server-sdk';

const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY ?? '';
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET ?? '';
const LIVEKIT_URL = process.env.LIVEKIT_URL ?? '';

export function isLiveKitConfigured(): boolean {
  return Boolean(LIVEKIT_API_KEY && LIVEKIT_API_SECRET && LIVEKIT_URL);
}

export async function generateVoiceToken(userId: string, username: string, roomId: string): Promise<string> {
  const token = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
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
