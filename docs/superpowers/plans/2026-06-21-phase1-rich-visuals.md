# Phase 1 - Rich Visuals Implementation Notes

**Goal:** Make the Phase 0 bar/garden world feel materially richer while preserving the streamed-sector architecture and bar-to-garden continuity.

## Implemented Scope

- Bar visual pass:
  - wood-plank tile details;
  - raised bar walls and counter segments;
  - bottle shelves with warm glow;
  - stools, tables, and jukebox.
- Garden visual pass:
  - grass blade and path surface details;
  - trees, shrubs, flower patches, grass tufts;
  - benches, garden tables, umbrellas;
  - string lights with night glow.
- Atmosphere:
  - softer avatar shadow;
  - canvas-level day/night tint cycle;
  - renderer-level light glow intensity driven by night factor.
- Rendering model:
  - sector data now supports `decorations`;
  - non-walkable invisible tiles are supported for blocked-but-not-rendered space;
  - decorations render as depth-sorted Phaser objects separate from the floor layer.

## Verification

- `pnpm.cmd --filter client test`
- `pnpm.cmd --filter client typecheck`
- `pnpm.cmd --filter client build`
- Headless Chrome runtime smoke test:
  - login;
  - enter bar;
  - capture bar screenshot;
  - walk south into garden;
  - capture garden screenshot;
  - verify visual transition and no Phaser/runtime errors.

## Follow-Ups

- Fase 2 can reuse the new decoration model to mark stools, benches, and chairs as sit targets.
- If sector decoration count grows substantially, cache static sector graphics to textures.
