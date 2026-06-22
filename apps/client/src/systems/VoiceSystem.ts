import {
  Room,
  RoomEvent,
  Track,
  ConnectionState,
} from 'livekit-client';

export interface VoiceCallbacks {
  onSpeakingChanged?: (userId: string, speaking: boolean) => void;
  onConnected?: () => void;
  onDisconnected?: () => void;
  onError?: (err: Error) => void;
}

export class VoiceSystem {
  private _room: Room | null = null;
  private _callbacks: VoiceCallbacks = {};
  private _muted = false;
  private _ready = false;
  private _roomId: string | null = null;
  private _remoteAudio = new Map<string, Set<HTMLMediaElement>>();
  private _participantVolumes = new Map<string, number>();
  private _participantMuted = new Set<string>();

  setCallbacks(cb: VoiceCallbacks): void {
    this._callbacks = cb;
  }

  get isReady(): boolean { return this._ready; }
  get isMuted(): boolean { return this._muted; }
  get roomId(): string | null { return this._roomId; }

  /** Fetches a LiveKit token from our server and connects to the room. */
  async connect(authToken: string, roomId: string): Promise<void> {
    if (this._room && this._roomId === roomId && this._ready) return;
    await this.disconnect();

    try {
      const res = await fetch(`/api/voice/token?roomId=${encodeURIComponent(roomId)}`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });

      if (!res.ok) {
        // Voice not configured — silently skip
        console.info('[Voice] Not available:', (await res.json() as { error: string }).error);
        return;
      }

      const { token, url } = await res.json() as { token: string; url: string };

      this._room = new Room({
        adaptiveStream: true,
        dynacast: true,
        audioCaptureDefaults: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      this._setupRoomListeners();
      await this._room.connect(url, token);
      await this._room.localParticipant.setMicrophoneEnabled(!this._muted);
      this._ready = true;
      this._roomId = roomId;
      this._callbacks.onConnected?.();
    } catch (err) {
      this._callbacks.onError?.(err instanceof Error ? err : new Error(String(err)));
    }
  }

  toggleMute(): boolean {
    this._muted = !this._muted;
    this._room?.localParticipant.setMicrophoneEnabled(!this._muted);
    return this._muted;
  }

  setParticipantMuted(userId: string, muted: boolean): void {
    if (muted) this._participantMuted.add(userId);
    else this._participantMuted.delete(userId);
    this._applyParticipantAudio(userId);
  }

  isParticipantMuted(userId: string): boolean {
    return this._participantMuted.has(userId);
  }

  setParticipantVolume(userId: string, volume: number): void {
    this._participantVolumes.set(userId, Math.max(0, Math.min(1, volume)));
    this._applyParticipantAudio(userId);
  }

  async switchInputDevice(deviceId: string): Promise<void> {
    if (!this._room) return;
    await this._room.switchActiveDevice('audioinput', deviceId);
  }

  async disconnect(): Promise<void> {
    if (this._room) {
      await this._room.disconnect();
      this._room = null;
    }
    this._remoteAudio.forEach((elements) => elements.forEach((el) => el.remove()));
    this._remoteAudio.clear();
    this._ready = false;
    this._roomId = null;
  }

  private _applyParticipantAudio(userId: string): void {
    const elements = this._remoteAudio.get(userId);
    if (!elements) return;
    const muted = this._participantMuted.has(userId);
    const volume = this._participantVolumes.get(userId) ?? 1;
    elements.forEach((el) => {
      el.muted = muted || volume <= 0;
      el.volume = muted ? 0 : volume;
    });
  }

  private _setupRoomListeners(): void {
    if (!this._room) return;

    this._room.on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
      // Notify who is currently speaking
      const speaking = new Set(speakers.map((s) => s.identity));

      this._room?.remoteParticipants.forEach((p) => {
        this._callbacks.onSpeakingChanged?.(p.identity, speaking.has(p.identity));
      });

      const local = this._room?.localParticipant;
      if (local) {
        this._callbacks.onSpeakingChanged?.(local.identity, speaking.has(local.identity));
      }
    });

    this._room.on(RoomEvent.TrackSubscribed, (track, _pub, participant) => {
      if (track.kind === Track.Kind.Audio) {
        const el = track.attach();
        el.autoplay = true;
        const userId = participant.identity;
        const elements = this._remoteAudio.get(userId) ?? new Set<HTMLMediaElement>();
        elements.add(el);
        this._remoteAudio.set(userId, elements);
        this._applyParticipantAudio(userId);
        document.body.appendChild(el);
      }
    });

    this._room.on(RoomEvent.TrackUnsubscribed, (track, _pub, participant) => {
      const userId = participant.identity;
      track.detach().forEach((el) => {
        this._remoteAudio.get(userId)?.delete(el);
        el.remove();
      });
      if (this._remoteAudio.get(userId)?.size === 0) this._remoteAudio.delete(userId);
    });

    this._room.on(RoomEvent.ConnectionStateChanged, (state) => {
      if (state === ConnectionState.Disconnected) {
        this._ready = false;
        this._callbacks.onDisconnected?.();
      }
    });
  }
}
