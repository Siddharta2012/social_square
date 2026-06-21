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

  setCallbacks(cb: VoiceCallbacks): void {
    this._callbacks = cb;
  }

  get isReady(): boolean { return this._ready; }
  get isMuted(): boolean { return this._muted; }

  /** Fetches a LiveKit token from our server and connects to the room. */
  async connect(authToken: string, roomId: string): Promise<void> {
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
      await this._room.localParticipant.setMicrophoneEnabled(true);
      this._ready = true;
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

  async switchInputDevice(deviceId: string): Promise<void> {
    if (!this._room) return;
    await this._room.switchActiveDevice('audioinput', deviceId);
  }

  async disconnect(): Promise<void> {
    if (this._room) {
      await this._room.disconnect();
      this._room = null;
    }
    this._ready = false;
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

    this._room.on(RoomEvent.TrackSubscribed, (track, _pub, _participant) => {
      if (track.kind === Track.Kind.Audio) {
        const el = track.attach();
        el.volume = 1;
        document.body.appendChild(el);
      }
    });

    this._room.on(RoomEvent.TrackUnsubscribed, (track) => {
      track.detach().forEach((el) => el.remove());
    });

    this._room.on(RoomEvent.ConnectionStateChanged, (state) => {
      if (state === ConnectionState.Disconnected) {
        this._ready = false;
        this._callbacks.onDisconnected?.();
      }
    });
  }
}
