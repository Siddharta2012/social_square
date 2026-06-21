# Phase 6 - Espansione Paese, Prima Tranche

Date: 2026-06-21
Status: implemented

## Scope

- Add two new asynchronously-loaded sectors:
  - `(1,1)` village plaza east of the garden;
  - `(1,0)` street and shop sector north of the plaza.
- Extend the garden path to the eastern sector edge.
- Add village points of interest:
  - fountain;
  - market stalls;
  - shop fronts;
  - street lamps with night glow;
  - signposts;
  - planters.
- Verify sector-to-sector continuity:
  - garden to plaza;
  - plaza to street.

## Notes

- This is the first concrete Phase 6+ expansion step. Interest management remains a
  separate network scalability pass; the current room broadcast remains acceptable for the
  small-map prototype.
- New visual objects are still procedural Phaser graphics, matching the current art stack.

## Verification

- `pnpm.cmd --filter client typecheck`
- `pnpm.cmd --filter client test`
- `pnpm.cmd build`
- Runtime smoke:
  - enter the bar;
  - walk south into the garden;
  - follow the east path into the plaza;
  - walk north into the shop street;
  - verify sector loading and visual POIs render without console errors.
