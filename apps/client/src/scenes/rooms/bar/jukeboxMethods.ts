import {
  Direction,
  JUKEBOX_PLAY_COST,
  jukeboxTitle,
  normalizeJukeboxState,
  parseJukeboxExternalTrack,
  type Position,
} from '@social-square/shared';
import { t } from '../../../i18n';
import { useGameStore } from '../../../store/gameStore';
import { JUKEBOX_OBJECT_ID, JUKEBOX_POSITION } from '../../../world/interactions';

function requestId(prefix: string): string {
  return `${prefix}:${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}:${Math.random().toString(36).slice(2)}`}`;
}

export function requestJukeboxToggle(this: any): void {
  if (!this._isInJukeboxLocation()) {
    this._showNotice(t('jukebox.available'));
    return;
  }
  if (!this._isNear(JUKEBOX_POSITION)) {
    this._showNotice(t('jukebox.near'));
    return;
  }

  if (this._jukeboxState.playing) {
    this._showNotice(t('jukebox.locked'));
    return;
  }

  if (useGameStore.getState().petals < JUKEBOX_PLAY_COST) {
    this._showNotice(t('common.petalsRequired', { cost: JUKEBOX_PLAY_COST }));
    return;
  }

  const local = syncJukeboxPositionForServer.call(this);
  this._network?.emitInteract(JUKEBOX_OBJECT_ID, 'jukebox-toggle', {
    requestId: requestId('jukebox-toggle'),
    ...(local ? { playerX: local.x, playerY: local.y } : {}),
  });
}

export function requestJukeboxNext(this: any): void {
  if (!this._isInJukeboxLocation()) {
    this._showNotice(t('jukebox.available'));
    return;
  }
  if (!this._isNear(JUKEBOX_POSITION)) {
    this._showNotice(t('jukebox.near'));
    return;
  }

  if (this._jukeboxState.playing) {
    this._showNotice(t('jukebox.locked'));
    return;
  }

  if (useGameStore.getState().petals < JUKEBOX_PLAY_COST) {
    this._showNotice(t('common.petalsRequired', { cost: JUKEBOX_PLAY_COST }));
    return;
  }

  const local = syncJukeboxPositionForServer.call(this);
  this._network?.emitInteract(JUKEBOX_OBJECT_ID, 'jukebox-next', {
    requestId: requestId('jukebox-next'),
    ...(local ? { playerX: local.x, playerY: local.y } : {}),
  });
}

export function requestJukeboxPlayUrl(this: any, url: string): void {
  if (!this._isInJukeboxLocation()) {
    this._showNotice(t('jukebox.available'));
    return;
  }
  if (!this._isNear(JUKEBOX_POSITION)) {
    this._showNotice(t('jukebox.near'));
    return;
  }

  const externalTrack = parseJukeboxExternalTrack(url);
  if (!externalTrack) {
    this._showNotice(t('jukebox.invalidUrl'));
    return;
  }

  if (this._jukeboxState.playing) {
    this._showNotice(t('jukebox.locked'));
    return;
  }

  if (useGameStore.getState().petals < JUKEBOX_PLAY_COST) {
    this._showNotice(t('common.petalsRequired', { cost: JUKEBOX_PLAY_COST }));
    return;
  }

  const local = syncJukeboxPositionForServer.call(this);
  this._network?.emitInteract(JUKEBOX_OBJECT_ID, 'jukebox-play-url', {
    url,
    requestId: requestId('jukebox-play-url'),
    ...(local ? { playerX: local.x, playerY: local.y } : {}),
  });
}

export async function applyJukeboxState(this: any, rawState: unknown): Promise<void> {
  const state = normalizeJukeboxState(rawState);
  this._jukeboxState = state;
  if (!this._isInJukeboxLocation()) {
    await this._jukebox.applyState({ ...state, playing: false });
    useGameStore.getState().setJukeboxStatus(null);
    return;
  }

  const result = await this._jukebox.applyState(state);
  useGameStore.getState().setJukeboxStatus({
    trackId: state.trackId,
    title: state.externalTrack?.title ?? jukeboxTitle(state.trackId),
    playing: state.playing,
    blocked: result.blocked,
    source: state.externalTrack?.provider ?? 'local',
    expiresAt: state.expiresAt,
    externalUrl: state.externalTrack?.url,
    requestedBy: state.requestedBy,
    history: state.history,
  });
  this._syncJukeboxSpatial();
  if (result.blocked) this._showNotice(t('jukebox.blocked'));
}

export function isInJukeboxLocation(this: any): boolean {
  return this._currentLocationId() === '0,0';
}

export function syncJukeboxForLocation(this: any): void {
  if (this._isInJukeboxLocation()) return;
  this._jukebox.setSpatial(0, 0);
  void this._jukebox.applyState({ ...this._jukeboxState, playing: false });
  useGameStore.getState().setJukeboxStatus(null);
}

export function syncJukeboxSpatial(this: any): void {
  if (!this._jukeboxState.playing || !this._isInJukeboxLocation()) return;
  const local = this._localPosition();
  if (!local) return;
  const spatial = this._spatialFrom(local, JUKEBOX_POSITION, 11, 0.08);
  this._jukebox.setSpatial(spatial.volume, spatial.pan);
}

export function syncJukeboxExpiry(this: any): void {
  if (!this._jukeboxState.playing) return;
  const normalized = normalizeJukeboxState(this._jukeboxState);
  if (normalized.playing) return;
  this._jukeboxState = normalized;
  void this._applyJukeboxState(normalized);
}

export function syncJukeboxPositionForServer(this: any): Position | null {
  const local = this._localPosition();
  if (!local) return null;
  this._network?.emitMove(
    local.x,
    local.y,
    Direction.SE,
    this.movementSystem.isMoving ? 'walk' : 'idle',
    true,
  );
  return local;
}
