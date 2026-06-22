import {
  JUKEBOX_TRACKS,
  normalizeJukeboxState,
  youtubeEmbedUrl,
  type JukeboxState,
  type JukeboxTrackId,
} from '@social-square/shared';

interface PlaybackResult {
  played: boolean;
  blocked: boolean;
}

const SAMPLE_RATE = 22050;
const TWO_PI = Math.PI * 2;

const MELODIES: Record<JukeboxTrackId, number[]> = {
  'sunset-swing': [392, 440, 494, 587, 494, 440, 392, 330],
  'garden-groove': [330, 392, 440, 392, 523, 494, 440, 392],
  'midnight-pixels': [262, 330, 392, 523, 392, 330, 294, 247],
};

const BASS: Record<JukeboxTrackId, number[]> = {
  'sunset-swing': [98, 98, 123, 147],
  'garden-groove': [82, 110, 98, 123],
  'midnight-pixels': [65, 82, 98, 82],
};

function trackDurationSeconds(trackId: JukeboxTrackId): number {
  return (JUKEBOX_TRACKS.find((track) => track.id === trackId)?.durationMs ?? 8000) / 1000;
}

function envelope(phase: number): number {
  if (phase < 0.08) return phase / 0.08;
  if (phase > 0.82) return Math.max(0, (1 - phase) / 0.18);
  return 1;
}

function generateSamples(trackId: JukeboxTrackId): Float32Array {
  const duration = trackDurationSeconds(trackId);
  const samples = new Float32Array(Math.floor(SAMPLE_RATE * duration));
  const melody = MELODIES[trackId];
  const bass = BASS[trackId];

  for (let i = 0; i < samples.length; i++) {
    const t = i / SAMPLE_RATE;
    const step = Math.floor(t * 2) % melody.length;
    const bassStep = Math.floor(t) % bass.length;
    const phase = (t * 2) % 1;
    const beatPhase = (t * 2) % 1;

    const lead = Math.sin(TWO_PI * melody[step] * t) * 0.22 * envelope(phase);
    const harmony = Math.sin(TWO_PI * melody[(step + 2) % melody.length] * t) * 0.08 * envelope(phase);
    const low = Math.sin(TWO_PI * bass[bassStep] * t) * 0.2;
    const kick = beatPhase < 0.16
      ? Math.sin(TWO_PI * (58 + beatPhase * 90) * t) * Math.exp(-beatPhase * 18) * 0.26
      : 0;

    samples[i] = Math.max(-0.95, Math.min(0.95, lead + harmony + low + kick));
  }

  return samples;
}

function wavBlob(samples: Float32Array): Blob {
  const bytesPerSample = 2;
  const buffer = new ArrayBuffer(44 + samples.length * bytesPerSample);
  const view = new DataView(buffer);

  const writeString = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i));
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * bytesPerSample, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, SAMPLE_RATE, true);
  view.setUint32(28, SAMPLE_RATE * bytesPerSample, true);
  view.setUint16(32, bytesPerSample, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, samples.length * bytesPerSample, true);

  let offset = 44;
  for (const sample of samples) {
    view.setInt16(offset, sample * 0x7fff, true);
    offset += bytesPerSample;
  }

  return new Blob([buffer], { type: 'audio/wav' });
}

export class JukeboxPlayer {
  private _urls = new Map<JukeboxTrackId, string>();
  private _audio: HTMLAudioElement | null = null;
  private _youtubeShell: HTMLDivElement | null = null;
  private _youtubeFrame: HTMLIFrameElement | null = null;
  private _youtubeVideoId: string | null = null;
  private _youtubeStartedAt: number | null = null;
  private _youtubeActivationRequested = false;
  private _trackId: JukeboxTrackId | null = null;
  private _volume = 0.32;
  private _pan = 0;
  private _audioContext: AudioContext | null = null;
  private _audioSource: MediaElementAudioSourceNode | null = null;
  private _audioGain: GainNode | null = null;
  private _audioPanner: StereoPannerNode | null = null;

  async applyState(state: JukeboxState): Promise<PlaybackResult> {
    const next = normalizeJukeboxState(state);

    if (!next.playing) {
      this._audio?.pause();
      this._hideExternalPlayer();
      return { played: false, blocked: false };
    }

    if (next.externalTrack?.provider === 'youtube') {
      this._audio?.pause();
      this._showYouTubePlayer(next);
      return { played: false, blocked: true };
    }

    this._hideExternalPlayer();
    const audio = this._ensureAudio(next.trackId);
    const duration = trackDurationSeconds(next.trackId);
    const elapsedSeconds = next.startedAt === null ? 0 : Math.max(0, (Date.now() - next.startedAt) / 1000);
    const syncedTime = elapsedSeconds % duration;

    const syncPosition = () => {
      try {
        audio.currentTime = Math.min(Math.max(syncedTime, 0), duration - 0.05);
      } catch {
        // Some browsers reject currentTime before metadata; the next state update will resync.
      }
    };

    if (audio.readyState >= HTMLMediaElement.HAVE_METADATA) {
      syncPosition();
    } else {
      audio.addEventListener('loadedmetadata', syncPosition, { once: true });
    }

    try {
      await audio.play();
      return { played: true, blocked: false };
    } catch {
      return { played: false, blocked: true };
    }
  }

  destroy(): void {
    this._audio?.pause();
    this._audio = null;
    this._disconnectAudioGraph();
    if (this._audioContext && this._audioContext.state !== 'closed') {
      void this._audioContext.close().catch(() => undefined);
    }
    this._audioContext = null;
    this._hideExternalPlayer();
    for (const url of this._urls.values()) URL.revokeObjectURL(url);
    this._urls.clear();
    this._trackId = null;
  }

  setSpatial(volume: number, pan = 0): void {
    this._volume = clamp(volume, 0, 1) * 0.36;
    this._pan = clamp(pan, -1, 1);
    this._applyLocalSpatial();
  }

  private _ensureAudio(trackId: JukeboxTrackId): HTMLAudioElement {
    if (this._audio && this._trackId === trackId) return this._audio;

    this._audio?.pause();
    this._disconnectAudioGraph();
    const audio = new Audio(this._urlFor(trackId));
    audio.loop = true;
    this._audio = audio;
    this._trackId = trackId;
    this._ensureAudioGraph(audio);
    this._applyLocalSpatial();
    return audio;
  }

  private _ensureAudioGraph(audio: HTMLAudioElement): void {
    try {
      const context = this._audioContext ?? createAudioContext();
      if (!context) return;
      this._audioContext = context;
      const source = context.createMediaElementSource(audio);
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

      this._audioSource = source;
      this._audioGain = gain;
      this._audioPanner = panner;
    } catch {
      this._disconnectAudioGraph();
    }
  }

  private _applyLocalSpatial(): void {
    if (!this._audio) return;
    if (this._audioGain && this._audioContext) {
      this._audio.volume = 1;
      this._audioGain.gain.setTargetAtTime(this._volume, this._audioContext.currentTime, 0.06);
      this._audioPanner?.pan.setTargetAtTime(this._pan, this._audioContext.currentTime, 0.08);
      void this._audioContext.resume().catch(() => undefined);
    } else {
      this._audio.volume = this._volume;
    }
  }

  private _disconnectAudioGraph(): void {
    this._audioSource?.disconnect();
    this._audioPanner?.disconnect();
    this._audioGain?.disconnect();
    this._audioSource = null;
    this._audioPanner = null;
    this._audioGain = null;
  }

  private _urlFor(trackId: JukeboxTrackId): string {
    const existing = this._urls.get(trackId);
    if (existing) return existing;

    const url = URL.createObjectURL(wavBlob(generateSamples(trackId)));
    this._urls.set(trackId, url);
    return url;
  }

  private _showYouTubePlayer(state: JukeboxState): void {
    const videoId = state.externalTrack?.videoId;
    if (!videoId) return;

    const elapsedSeconds = youtubeElapsedSeconds(state.startedAt);
    const src = youtubeEmbedUrl(videoId, elapsedSeconds, window.location.origin);
    if (
      this._youtubeFrame &&
      this._youtubeVideoId === videoId &&
      this._youtubeStartedAt === state.startedAt
    ) {
      this._youtubeShell?.style.setProperty('display', 'block');
      return;
    }

    this._hideExternalPlayer();

    const shell = document.createElement('div');
    shell.style.position = 'fixed';
    shell.style.right = '12px';
    shell.style.bottom = '72px';
    shell.style.width = 'min(380px, calc(100vw - 24px))';
    shell.style.aspectRatio = '16 / 9';
    shell.style.zIndex = '180';
    shell.style.background = 'rgba(10,10,30,0.94)';
    shell.style.border = '1px solid rgba(150,150,255,0.35)';
    shell.style.borderRadius = '6px';
    shell.style.overflow = 'hidden';
    shell.style.boxShadow = '0 12px 32px rgba(0,0,0,0.36)';
    shell.style.pointerEvents = 'auto';

    const frame = document.createElement('iframe');
    frame.src = src;
    frame.title = state.externalTrack?.title ?? 'YouTube jukebox';
    frame.width = '320';
    frame.height = '200';
    frame.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; fullscreen; gyroscope; picture-in-picture; web-share';
    frame.allowFullscreen = true;
    frame.loading = 'eager';
    frame.referrerPolicy = 'strict-origin-when-cross-origin';
    frame.style.width = '100%';
    frame.style.height = '100%';
    frame.style.border = '0';

    const playButton = document.createElement('button');
    playButton.type = 'button';
    playButton.textContent = 'Play';
    playButton.title = 'Play YouTube';
    playButton.style.position = 'absolute';
    playButton.style.left = '8px';
    playButton.style.top = '8px';
    playButton.style.height = '30px';
    playButton.style.padding = '0 12px';
    playButton.style.background = 'rgba(10,10,30,0.86)';
    playButton.style.border = '1px solid rgba(255,244,208,0.46)';
    playButton.style.borderRadius = '4px';
    playButton.style.color = '#fff4d0';
    playButton.style.fontFamily = 'monospace';
    playButton.style.fontSize = '12px';
    playButton.style.fontWeight = '700';
    playButton.style.cursor = 'pointer';
    playButton.style.zIndex = '1';
    playButton.style.pointerEvents = 'auto';
    playButton.addEventListener('click', () => {
      playButton.remove();
      this._activateYouTubePlayback();
    });

    frame.addEventListener('load', () => {
      if (this._youtubeActivationRequested) this._seekAndPlayYouTube();
    });

    shell.appendChild(frame);
    shell.appendChild(playButton);
    document.body.appendChild(shell);
    this._youtubeShell = shell;
    this._youtubeFrame = frame;
    this._youtubeVideoId = videoId;
    this._youtubeStartedAt = state.startedAt;
  }

  private _hideExternalPlayer(): void {
    this._youtubeFrame = null;
    this._youtubeVideoId = null;
    this._youtubeStartedAt = null;
    this._youtubeActivationRequested = false;
    this._youtubeShell?.remove();
    this._youtubeShell = null;
  }

  private _activateYouTubePlayback(): void {
    if (!this._youtubeFrame || !this._youtubeVideoId) return;
    this._youtubeActivationRequested = true;
    this._seekAndPlayYouTube();
    window.setTimeout(() => this._seekAndPlayYouTube(), 300);
    window.setTimeout(() => this._seekAndPlayYouTube(), 900);
    window.setTimeout(() => {
      this._youtubeActivationRequested = false;
    }, 1600);
  }

  private _seekAndPlayYouTube(): void {
    this._postYouTubeCommand('seekTo', [Math.floor(youtubeElapsedSeconds(this._youtubeStartedAt)), true]);
    this._postYouTubeCommand('playVideo');
  }

  private _postYouTubeCommand(func: 'playVideo' | 'seekTo', args: Array<number | boolean> = []): void {
    const target = this._youtubeFrame?.contentWindow;
    if (!target) return;
    const message = JSON.stringify({ event: 'command', func, args });
    target.postMessage(message, 'https://www.youtube-nocookie.com');
    target.postMessage(message, 'https://www.youtube.com');
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function youtubeElapsedSeconds(startedAt: number | null): number {
  return startedAt === null ? 0 : Math.max(0, (Date.now() - startedAt) / 1000);
}

function createAudioContext(): AudioContext | null {
  const win = window as Window & { webkitAudioContext?: typeof AudioContext };
  const AudioContextCtor = window.AudioContext ?? win.webkitAudioContext;
  return AudioContextCtor ? new AudioContextCtor() : null;
}
