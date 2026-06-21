# Phase 6 - Object Interest Management

Date: 2026-06-22
Status: implemented

## Scope

- Move shared interactive object definitions into `packages/shared` so client and server use
  the same stable object IDs and seat positions.
- Extend interest helpers to cover object state snapshots:
  - known seats resolve through `SEAT_DEFINITIONS`;
  - generic positioned objects resolve from `{ x, y }` state;
  - jukebox and waiter remain room-wide for now.
- Filter `room-state.objects` for joining clients by the viewer's sector-interest ring.
- Emit `object-state-changed` only to interested clients for filtered objects.
- Send visible object snapshots to the moving client when crossing a sector boundary.

## Notes

- Jukebox state remains room-wide because it drives shared audio and HUD state.
- Waiter state remains room-wide until the protocol has an explicit object-removal event;
  filtering it without removal could leave a stale waiter avatar at the last visible point.
- Seat occupancy is safe to filter because seats have stable positions and clients receive
  fresh visible object snapshots when they enter a new sector.

## Verification

- `pnpm.cmd --filter shared build`
- `pnpm.cmd --filter client test interest`
- `pnpm.cmd --filter server typecheck`
- `pnpm.cmd --filter client typecheck`
