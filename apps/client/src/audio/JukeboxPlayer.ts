import {
  JUKEBOX_TRACKS,
  normalizeJukeboxState,
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
  private _trackId: JukeboxTrackId | null = null;

  async applyState(state: JukeboxState): Promise<PlaybackResult> {
    const next = normalizeJukeboxState(state);

    if (!next.playing) {
      this._audio?.pause();
      return { played: false, blocked: false };
    }

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
    for (const url of this._urls.values()) URL.revokeObjectURL(url);
    this._urls.clear();
    this._trackId = null;
  }

  private _ensureAudio(trackId: JukeboxTrackId): HTMLAudioElement {
    if (this._audio && this._trackId === trackId) return this._audio;

    this._audio?.pause();
    const audio = new Audio(this._urlFor(trackId));
    audio.loop = true;
    audio.volume = 0.32;
    this._audio = audio;
    this._trackId = trackId;
    return audio;
  }

  private _urlFor(trackId: JukeboxTrackId): string {
    const existing = this._urls.get(trackId);
    if (existing) return existing;

    const url = URL.createObjectURL(wavBlob(generateSamples(trackId)));
    this._urls.set(trackId, url);
    return url;
  }
}
