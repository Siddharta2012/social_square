# Phase 2 - Seating, Emotes, and Urgent Interaction Polish

Date: 2026-06-21
Status: implemented

## Scope

- Add keyboard movement with arrow keys and WASD while preserving click-to-move.
- Promote the jukebox from visual decoration to a shared interactive object.
- Implement Phase 2 seating:
  - clickable bar stools and garden benches;
  - shared seat occupancy via `object-state-changed`;
  - local and remote avatar `sit` pose.
- Implement Phase 2 emotes:
  - `wave`, `dance`, `clap`;
  - HUD buttons;
  - keyboard shortcuts 1/2/3;
  - socket propagation through `emote` / `user-emote`.

## Notes

- Jukebox audio is generated locally as short looping WAV blobs and played through
  `HTMLAudioElement`, avoiding external audio assets for this phase.
- The server stores object states in Redis alongside room users, with the same TTL policy.
- Seat state is cleared when a user leaves the room or disconnects.

## Verification

- `pnpm.cmd --filter client typecheck`
- `pnpm.cmd --filter client test`
- `pnpm.cmd build`
- Runtime smoke:
  - enter the bar;
  - move with WASD/arrows;
  - click jukebox / HUD Play / Next;
  - click a seat, sit, then move or press Alzati;
  - trigger emotes from HUD and keys 1/2/3.
