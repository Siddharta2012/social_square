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

export interface ParticipantSpatialState {
  volume: number;
  pan: number;
}

interface ElementAudioGraph {
  context: AudioContext;
  source: MediaElementAudioSourceNode;
  gain: GainNode;
  panner: StereoPannerNode | null;
}

export class VoiceSystem {
  private _room: Room | null = null;
  private _callbacks: VoiceCallbacks = {};
  private _muted = false;
  private _ready = false;
  private _roomId: string | null = null;
  private _remoteAudio = new Map<string, Set<HTMLMediaElement>>();
  private _participantSpatial = new Map<string, ParticipantSpatialState>();
  private _participantMuted = new Set<string>();
  private _elementGraphs = new Map<HTMLMediaElement, ElementAudioGraph>();
  private _audioContext: AudioContext | null = null;

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
    const current = this._participantSpatial.get(userId) ?? { volume: 1, pan: 0 };
    this._participantSpatial.set(userId, {
      ...current,
      volume: clamp(volume, 0, 1),
    });
    this._applyParticipantAudio(userId);
  }

  setParticipantSpatial(userId: string, spatial: Partial<ParticipantSpatialState>): void {
    const current = this._participantSpatial.get(userId) ?? { volume: 1, pan: 0 };
    this._participantSpatial.set(userId, {
      volume: clamp(spatial.volume ?? current.volume, 0, 1),
      pan: clamp(spatial.pan ?? current.pan, -1, 1),
    });
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
    this._remoteAudio.forEach((elements) => elements.forEach((el) => this._removeAudioElement(el)));
    this._remoteAudio.clear();
    this._ready = false;
    this._roomId = null;
  }

  private _applyParticipantAudio(userId: string): void {
    const elements = this._remoteAudio.get(userId);
    if (!elements) return;
    const muted = this._participantMuted.has(userId);
    const spatial = this._participantSpatial.get(userId) ?? { volume: 1, pan: 0 };
    elements.forEach((el) => {
      const graph = this._ensureAudioGraph(el);
      const volume = muted ? 0 : spatial.volume;
      el.muted = muted || volume <= 0;
      if (graph) {
        el.volume = 1;
        graph.gain.gain.setTargetAtTime(volume, graph.context.currentTime, 0.045);
        graph.panner?.pan.setTargetAtTime(spatial.pan, graph.context.currentTime, 0.06);
        void graph.context.resume().catch(() => undefined);
      } else {
        el.volume = volume;
      }
    });
  }

  private _ensureAudioGraph(el: HTMLMediaElement): ElementAudioGraph | null {
    const existing = this._elementGraphs.get(el);
    if (existing) return existing;

    try {
      const context = this._audioContext ?? createAudioContext();
      if (!context) return null;
      this._audioContext = context;

      const source = context.createMediaElementSource(el);
      const gain = context.createGain();
      const panner = typeof context.createStereoPanner === 'function'
        ? context.createStereoPanner()
        : null;

      if (panner) {
        source.connect(panner);
        panner.connect(gain);
      } else {
        source.connect(gain);
      }
      gain.connect(context.destination);

      const graph = { context, source, gain, panner };
      this._elementGraphs.set(el, graph);
      return graph;
    } catch {
      return null;
    }
  }

  private _removeAudioElement(el: HTMLMediaElement): void {
    const graph = this._elementGraphs.get(el);
    if (graph) {
      graph.source.disconnect();
      graph.panner?.disconnect();
      graph.gain.disconnect();
      this._elementGraphs.delete(el);
    }
    el.remove();
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
        this._removeAudioElement(el);
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

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function createAudioContext(): AudioContext | null {
  const win = window as Window & { webkitAudioContext?: typeof AudioContext };
  const AudioContextCtor = window.AudioContext ?? win.webkitAudioContext;
  return AudioContextCtor ? new AudioContextCtor() : null;
}
