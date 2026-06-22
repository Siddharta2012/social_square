import { RemoteAvatar } from '../../../entities/RemoteAvatar';
import { useGameStore } from '../../../store/gameStore';
import type { AvatarConfig, AvatarState, HeldItem } from '@social-square/shared';

export function destroyAllRemotes(this: any): void {
  this._remoteAvatars.forEach((avatar: RemoteAvatar, userId: string) => {
    this.isoSystem.unregister(avatar);
    avatar.destroy();
    this._voice?.setParticipantSpatial(userId, { volume: 0, pan: 0 });
  });
  this._remoteAvatars.clear();
  this._movingRemoteAvatars.clear();
  this._speakingVoiceUsers.clear();
  this._setSpeakingUi([]);
  useGameStore.getState().setUserActionMenu(null);
}

export function spawnRemote(
  this: any,
  userId: string,
  username: string,
  worldX: number,
  worldY: number,
  heldItem: HeldItem = null,
  state: AvatarState = 'idle',
  avatarConfig?: AvatarConfig,
): void {
  if (this._remoteAvatars.has(userId)) return;
  const avatar = new RemoteAvatar({ scene: this, username, worldX, worldY, avatarConfig });
  this._attachRemoteInteractions(userId, username, avatar);
  if (heldItem) avatar.setHeldItem(heldItem);
  avatar.playAnimation(state);
  this._remoteAvatars.set(userId, avatar);
  this.isoSystem.register(avatar, worldX, worldY);
  this._syncVoiceSpatial(999);
}

export function updateRemoteAvatar(this: any, userId: string, avatarConfig: AvatarConfig): void {
  this._remoteAvatars.get(userId)?.setAvatarConfig(avatarConfig);
}

export function attachRemoteInteractions(
  this: any,
  userId: string,
  username: string,
  avatar: RemoteAvatar,
): void {
  let timer: Phaser.Time.TimerEvent | null = null;

  avatar.setData('interactable', true);
  avatar.setSize(44, 68);
  avatar.setInteractive(
    new Phaser.Geom.Rectangle(-22, -64, 44, 68),
    Phaser.Geom.Rectangle.Contains,
  );

  const clearTimer = () => {
    timer?.remove(false);
    timer = null;
  };

  avatar.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
    if (pointer.button !== 0) return;
    clearTimer();
    timer = this.time.delayedCall(520, () => {
      timer = null;
      useGameStore.getState().setUserActionMenu({
        userId,
        username,
        muted: this._mutedVoiceUsers.has(userId),
      });
    });
  });
  avatar.on('pointerup', clearTimer);
  avatar.on('pointerout', clearTimer);
  avatar.on('pointerupoutside', clearTimer);
}

export function destroyRemote(this: any, userId: string): void {
  const avatar = this._remoteAvatars.get(userId);
  if (!avatar) return;
  this.isoSystem.unregister(avatar);
  avatar.destroy();
  this._remoteAvatars.delete(userId);
  this._movingRemoteAvatars.delete(userId);
  this._voice?.setParticipantSpatial(userId, { volume: 0, pan: 0 });
  this._speakingVoiceUsers.delete(userId);
  this._syncVoiceSpatial(999);
  if (useGameStore.getState().userActionMenu?.userId === userId) {
    useGameStore.getState().setUserActionMenu(null);
  }
}
