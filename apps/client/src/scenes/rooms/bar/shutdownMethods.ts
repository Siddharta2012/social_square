import { POOL_PLAY_COST } from '@social-square/shared';
import { eventBus } from '../../../eventBus';
import { useGameStore } from '../../../store/gameStore';
import { PETAL_ACTION_COST } from '../../../world/interactions';

export function onShutdown(this: any): void {
  eventBus.off('exit-room');
  eventBus.off('voice-toggle');
  eventBus.off('audio-input-change');
  eventBus.off('emote');
  eventBus.off('leave-seat');
  eventBus.off('consume-held-item');
  eventBus.off('jukebox-toggle');
  eventBus.off('jukebox-next');
  eventBus.off('chat-send');
  eventBus.off('waiter-call');
  eventBus.off('waiter-order');
  eventBus.off('fast-travel');
  eventBus.off('voice-user-mute');
  eventBus.off('jukebox-play-url');
  eventBus.off('pool-open');
  eventBus.off('pool-start-solo');
  eventBus.off('pool-create-duo');
  eventBus.off('pool-join-duo');
  eventBus.off('pool-shot');
  eventBus.off('pool-sync');
  eventBus.off('pool-place-cue');
  eventBus.off('pool-leave');
  eventBus.off('whisper-send');
  eventBus.off('private-room-join');
  eventBus.off('avatar-updated');
  this.input.keyboard?.off('keydown-B');
  this.input.keyboard?.off('keydown-ONE');
  this.input.keyboard?.off('keydown-TWO');
  this.input.keyboard?.off('keydown-THREE');
  this.input.keyboard?.off('keydown-J');
  this.input.keyboard?.off('keydown-M');
  this.input.off(Phaser.Input.Events.POINTER_DOWN, this._primePetalAudio, this);
  this._jukebox.destroy();
  this._network.leaveRoom('bar');
  this._network.disconnect();
  void this._voice?.disconnect();
  this._remoteAvatars.forEach((a: any) => a.destroy());
  this._remoteAvatars.clear();
  this._speakingVoiceUsers.clear();
  this._destroyWaiterAvatar();
  this._petalSpawnTimer?.remove(false);
  this._petalSpawnTimer = null;
  this._petalBlooms.forEach((bloom: any) => bloom.station.destroy());
  this._petalBlooms = [];
  this._exitStations.forEach((station: any) => station.destroy());
  this._exitStations = [];
  this._destroyLocationStations();
  this._seatOccupants.clear();
  this._pendingSeat = null;
  this._seatedSeatId = null;
  this._noticeText?.destroy();
  this._noticeText = null;
  this._deliveredOrderIds.clear();
  this.destroyWorld();
  this.input.setDefaultCursor('default');
  useGameStore.getState().setConnected(false);
  useGameStore.getState().setCurrentRoom(null);
  useGameStore.getState().setRoomName(null);
  useGameStore.getState().setLocationName(null);
  useGameStore.getState().setRouteHint(null);
  useGameStore.getState().setTravelTargetName(null);
  useGameStore.getState().setShowWorldMap(false);
  useGameStore.getState().setUserActionMenu(null);
  useGameStore.getState().setUsersInRoom(0);
  useGameStore.getState().setProgress(null);
  useGameStore.getState().setVoiceAvailable(false);
  useGameStore.getState().setVoiceMuted(false);
  useGameStore.getState().setSpeakingUsers([]);
  useGameStore.getState().setHeldItem(null);
  useGameStore.getState().setJukeboxStatus(null);
  useGameStore.getState().setPoolStatus(null);
  useGameStore.getState().setShowPoolOverlay(false);
  useGameStore.getState().setPoolMessage(null);
  useGameStore.getState().setLocalAvatarState('idle');
  useGameStore.getState().clearChatMessages();
  useGameStore.getState().setWaiterStatus(null);
  useGameStore.getState().setWorldDebugMetrics(null);
  useGameStore.getState().setActionAvailability({
    nearJukebox: false,
    nearWaiter: false,
    nearPool: false,
    canAffordAction: useGameStore.getState().petals >= PETAL_ACTION_COST,
    canAffordPool: useGameStore.getState().petals >= POOL_PLAY_COST,
  });
  this._lastLocalContextKey = '';
}
