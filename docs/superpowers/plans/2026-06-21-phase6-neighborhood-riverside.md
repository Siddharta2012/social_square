# Phase 6 - Quartiere e Canale

Date: 2026-06-21
Status: implemented

## Scope

- Add two new asynchronously-loaded sectors:
  - `(2,1)` residential neighborhood east of the village plaza;
  - `(2,0)` riverside promenade connected to the shop street.
- Open the east path of the plaza sector so the new neighborhood is reachable.
- Add a water surface tile detail and bridge tiles for the riverside crossing.
- Add a new procedural `well` decoration for residential points of interest.
- Verify sector-to-sector continuity:
  - plaza to neighborhood;
  - shop street to riverside;
  - riverside to neighborhood.

## Notes

- The new sectors reuse the existing streamed-world architecture and dynamic sector
  registry.
- Houses are rendered with the existing `shopFront` primitive for now; the new POI added
  in this tranche is the neighborhood well.

## Verification

- `pnpm.cmd --filter client test phase6.neighborhood`
- `pnpm.cmd --filter client typecheck`
- `pnpm.cmd --filter client test`
- `pnpm.cmd build`
