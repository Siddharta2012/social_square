import { useGameStore } from '../../../store/gameStore';
import { useUserStore } from '../../../store/userStore';
import type { Position } from '@social-square/shared';

const VOICE_MUTE_STORAGE_KEY = 'social-square:voice-muted-users';

export async function setupVoice(this: any): Promise<void> {
  const { token } = useUserStore.getState();
  if (!token) return;
  if (import.meta.env.DEV && new URLSearchParams(window.location.search).has('novoice')) return;

  if (!this._voice) {
    const { VoiceSystem } = await import('../../../systems/VoiceSystem');
    this._voice = new VoiceSystem();
    this._voice.setCallbacks({
      onConnected: () => useGameStore.getState().setVoiceAvailable(true),
      onDisconnected: () => useGameStore.getState().setVoiceAvailable(false),
      onSpeakingChanged: (userId: string, speaking: boolean) => this._onSpeakingChanged(userId, speaking),
    });
  }

  await this._connectVoiceForCurrentLocation();
}

export async function connectVoiceForCurrentLocation(this: any): Promise<void> {
  const { token } = useUserStore.getState();
  if (!token || !this._voice) return;
  if (import.meta.env.DEV && new URLSearchParams(window.location.search).has('novoice')) return;

  const voiceRoomId = `bar:${this._currentLocationId()}`;
  const seq = ++this._voiceConnectSeq;
  await this._voice.connect(token, voiceRoomId);
  if (seq !== this._voiceConnectSeq) return;
  this._mutedVoiceUsers.forEach((userId: string) => this._voice?.setParticipantMuted(userId, true));
  this._syncVoiceSpatial(999);
}

export function syncVoiceSpatial(this: any, deltaMs: number): void {
  this._voiceSpatialElapsed += deltaMs;
  if (this._voiceSpatialElapsed < 220) return;
  this._voiceSpatialElapsed = 0;
  if (!this._voice?.isReady) {
    this._setSpeakingUi([]);
    return;
  }

  const local = this._localPosition();
  if (!local) return;

  const speakingUsers: Array<{ userId: string; username: string; distance: number; volume: number; pan: number }> = [];
  this._remoteAvatars.forEach((avatar: any, userId: string) => {
    const spatial = this._spatialFrom(local, { x: avatar.worldX, y: avatar.worldY }, 15, 0.1);
    this._voice?.setParticipantSpatial(userId, spatial);
    if (this._speakingVoiceUsers.has(userId) && !this._mutedVoiceUsers.has(userId)) {
      speakingUsers.push({
        userId,
        username: avatar.username,
        distance: spatial.distance,
        volume: spatial.volume,
        pan: spatial.pan,
      });
    }
  });
  speakingUsers.sort((a, b) => b.volume - a.volume);
  this._setSpeakingUi(speakingUsers.slice(0, 4));
}

export function setRemoteVoiceMuted(this: any, userId: string, muted: boolean): void {
  if (muted) this._mutedVoiceUsers.add(userId);
  else this._mutedVoiceUsers.delete(userId);

  this._saveMutedVoiceUsers();
  this._voice?.setParticipantMuted(userId, muted);
  this._syncVoiceSpatial(999);
  const avatar = this._remoteAvatars.get(userId);
  useGameStore.getState().setUserActionMenu(avatar ? {
    userId,
    username: avatar.username,
    muted,
  } : null);
}

export function onSpeakingChanged(this: any, userId: string, speaking: boolean): void {
  if (userId === this._myUserId) {
    this.localAvatar?.setSpeaking(speaking);
    return;
  }
  if (speaking) this._speakingVoiceUsers.add(userId);
  else this._speakingVoiceUsers.delete(userId);
  this._remoteAvatars.get(userId)?.setSpeaking(speaking);
  this._syncVoiceSpatial(999);
}

export function spatialFrom(
  listener: Position,
  source: Position,
  maxDistance: number,
  minVolume: number,
): { volume: number; pan: number; distance: number } {
  const dx = source.x - listener.x;
  const dy = source.y - listener.y;
  const distance = Math.sqrt(dx * dx + dy * dy);
  const nearRadius = 1.4;
  const t = Phaser.Math.Clamp((distance - nearRadius) / Math.max(1, maxDistance - nearRadius), 0, 1);
  const eased = t * t * (3 - 2 * t);
  const volume = Phaser.Math.Clamp(1 - eased, minVolume, 1);
  const pan = Phaser.Math.Clamp((dx - dy * 0.35) / 8, -1, 1);
  return { volume, pan, distance };
}

export function setSpeakingUi(this: any, users: Array<{ userId: string; username: string; distance: number; volume: number; pan: number }>): void {
  const key = users
    .map((user) => `${user.userId}:${Math.round(user.distance * 10)}:${Math.round(user.pan * 10)}`)
    .join('|');
  if (key === this._lastSpeakingUiKey) return;
  this._lastSpeakingUiKey = key;
  useGameStore.getState().setSpeakingUsers(users);
}

export function loadMutedVoiceUsers(this: any): void {
  try {
    const raw = localStorage.getItem(VOICE_MUTE_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    this._mutedVoiceUsers = new Set(Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === 'string')
      : []);
  } catch {
    this._mutedVoiceUsers = new Set();
  }
}

export function saveMutedVoiceUsers(this: any): void {
  try {
    localStorage.setItem(VOICE_MUTE_STORAGE_KEY, JSON.stringify([...this._mutedVoiceUsers]));
  } catch {
    // Storage can be unavailable in private contexts.
  }
}
