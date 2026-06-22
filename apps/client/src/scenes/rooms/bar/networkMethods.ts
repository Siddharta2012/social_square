import { type AvatarConfig } from '@social-square/shared';
import { eventBus } from '../../../eventBus';
import { errorText, t } from '../../../i18n';
import { useGameStore } from '../../../store/gameStore';
import { useUserStore } from '../../../store/userStore';
import { NetworkSystem } from '../../../systems/NetworkSystem';
import { applyAuthoritativeRoomState } from './roomStateReconciler';

export function setupNetwork(this: any): void {
  const { username = 'Player', token } = useUserStore.getState();

  this._network = new NetworkSystem();
  this._network.setCallbacks({
    onConnect: (socketId: string) => {
      const store = useUserStore.getState();
      this._myUserId = store.userId ?? socketId;
      if (!store.userId) useUserStore.getState().setUser(socketId, username ?? 'Player');
      useGameStore.getState().setConnected(true);
      useGameStore.getState().setRoomName('Bar');
      useGameStore.getState().setCurrentRoom('bar');

      const savedAvatar = useUserStore.getState().avatarConfig;
      const avatarConfig: AvatarConfig = savedAvatar
        ? {
            ...savedAvatar,
            userId: this._myUserId,
            username: username ?? 'Player',
          }
        : {
            userId: this._myUserId,
            username: username ?? 'Player',
            body: 0,
            outfit: 0,
            hair: 0,
            hairColor: '#4488ff',
            accessory: 0,
            expression: 0,
          };
      this._network.joinRoom('bar', avatarConfig);

      void this._setupVoice();
    },

    onDisconnect: () => {
      useGameStore.getState().setConnected(false);
    },

    onRoomState: (roomState: any) => {
      useGameStore.getState().setCurrentRoom(roomState.roomId);
      useGameStore
        .getState()
        .setRoomName(roomState.roomId.startsWith('private:') ? 'Stanza privata' : 'Bar');
      applyAuthoritativeRoomState(this, roomState);
    },

    onUserJoined: ({ userId, avatarConfig, position, state, heldItem }: any) => {
      if (userId === this._myUserId) return;
      this._spawnRemote(
        userId,
        avatarConfig.username,
        position.x,
        position.y,
        heldItem ?? null,
        state ?? 'idle',
        avatarConfig,
      );
    },

    onUserAvatarUpdated: ({ userId, avatarConfig }: any) => {
      if (userId === this._myUserId) {
        this.localAvatar?.setAvatarConfig(avatarConfig);
        useUserStore.getState().setAvatarConfig(avatarConfig);
        return;
      }
      this._updateRemoteAvatar(userId, avatarConfig);
    },

    onUserLeft: ({ userId }: any) => {
      this._destroyRemote(userId);
    },

    onUserMoved: ({ userId, x, y, direction, state }: any) => {
      if (userId === this._myUserId) {
        if (state === 'sit') this.setLocalAvatarTile(x, y, 'sit');
        else if (state === 'idle' && this._seatedSeatId) this.setLocalAvatarState(null);
        return;
      }
      const avatar = this._remoteAvatars.get(userId);
      if (avatar) this._setRemoteAvatarActive(userId, avatar.updateTarget(x, y, direction, state));
    },

    onRoomUsersCount: ({ roomId, count }: any) => {
      if (roomId === useGameStore.getState().currentRoomId)
        useGameStore.getState().setUsersInRoom(count);
    },

    onUserHeldItem: ({ userId, item }: any) => {
      if (userId === this._myUserId) return;
      this._remoteAvatars.get(userId)?.setHeldItem(item ?? null);
    },

    onItemGranted: ({ item, petals, cost }: any) => {
      this._pickUp(item);
      if (typeof petals === 'number') this._applyServerPetals(petals);
      const label = item === 'beer' ? t('item.beer') : t('item.pretzel');
      this._showNotice(t('bar.notice.itemGranted', { item: label, cost }));
      this._syncLocalContext();
    },

    onPetalsCollected: ({ amount, petals, position, requestId }: any) => {
      this._confirmPetalCollected(position, amount, petals, requestId);
    },

    onObjectStateChanged: ({ objectId, state }: any) => {
      this._applyObjectState(objectId, state);
    },

    onUserEmote: ({ userId, emoteId }: any) => {
      if (userId === this._myUserId) return;
      this._remoteAvatars.get(userId)?.playEmote(emoteId);
    },

    onUserChatMessage: (message: any) => {
      this._applyChatMessage(message);
    },

    onWhisperMessage: (message: any) => {
      eventBus.emit('whisper-received', message);
      const mine = message.fromUserId === this._myUserId;
      this._showNotice(
        mine ? `Whisper a ${message.toUserId}` : `Whisper da ${message.fromUsername}`,
      );
    },

    onAccountUpdated: ({ petals, avatarConfig, progress }: any) => {
      if (typeof petals === 'number') this._applyServerPetals(petals);
      if (progress) useGameStore.getState().setProgress(progress);
      if (avatarConfig) {
        useUserStore.getState().setAvatarConfig(avatarConfig);
        this.localAvatar?.setAvatarConfig(avatarConfig);
      }
    },

    onError: ({ code, message, requestId }: any) => {
      const localizedMessage = errorText(code, message);
      console.error(`[Network] ${code}: ${message}`);
      let noticeHandled = false;
      if (requestId && this._pendingPetalCollects.has(requestId)) {
        if (code === 'PETAL_COOLDOWN') {
          this._forgetPendingPetalCollect(requestId);
          this._showNotice(localizedMessage);
        } else {
          this._rollbackPendingPetalCollect(requestId, localizedMessage);
        }
        noticeHandled = true;
      } else if (
        (code === 'INVALID_PETAL' || code === 'TOO_FAR') &&
        this._pendingPetalCollects.size > 0
      ) {
        this._rollbackLatestPendingPetalCollect(localizedMessage);
        noticeHandled = true;
      } else if (code === 'PETAL_COOLDOWN') {
        this._rollbackLatestPendingPetalCollect(localizedMessage);
        noticeHandled = true;
      }
      if (localizedMessage) {
        const store = useGameStore.getState();
        if (
          store.showPoolOverlay &&
          (code.startsWith('POOL_') || code === 'INSUFFICIENT_PETALS' || code === 'TOO_FAR')
        ) {
          store.setPoolMessage({ text: localizedMessage, tone: 'error' });
        }
        if (!noticeHandled) this._showNotice(localizedMessage);
      }
    },
  });

  this._network.connect(username ?? 'Player', token ?? undefined);
}
