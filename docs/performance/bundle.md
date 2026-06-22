# Bundle Notes

Measured with `pnpm build` after lazy-loading `VoiceSystem`.

| Chunk | Minified | Gzip | Notes |
| --- | ---: | ---: | --- |
| `phaser` | 1,478.58 kB | 339.69 kB | Core game engine, intentionally split. |
| `livekit` | 506.34 kB | 132.61 kB | Loaded on demand through dynamic `VoiceSystem` import. |
| `index` | 215.41 kB | 65.48 kB | Main app code. |
| `react` | 140.81 kB | 45.25 kB | React vendor chunk. |

The only eager chunk over 700 kB is Phaser. LiveKit is no longer part of the
initial application module graph.
