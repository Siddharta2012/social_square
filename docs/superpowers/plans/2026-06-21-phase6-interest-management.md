# Phase 6 - Interest Management per Settori

Date: 2026-06-21
Status: implemented

## Scope

- Add shared sector-interest helpers used by client tests and server socket handlers.
- Keep the presence interest area aligned with world streaming:
  - sector size: `24` tiles;
  - radius: current sector plus the surrounding `3x3` ring.
- Send each joining client an interest-filtered `room-state` while preserving a
  `totalUsers` count for the HUD.
- Limit player presence/social events to nearby clients:
  - `user-joined`;
  - `user-left`;
  - `user-moved`;
  - `user-held-item`;
  - `user-emote`;
  - `user-chat-message`.
- Emit presence diffs when movement crosses an interest boundary:
  - nearby clients receive `user-joined` when a moving user enters range;
  - nearby clients receive `user-left` when a moving user leaves range;
  - the moving client receives matching appearance/disappearance events for peers.

## Notes

- Object state interest management is now split out in
  `2026-06-22-phase6-object-interest-management.md`: seats and generic positioned objects
  are filtered by sector interest, while jukebox and waiter remain room-wide for UX
  continuity.
- `user-joined` now optionally carries `state` and `heldItem`, so a user entering interest
  range can be spawned with the correct pose and item.

## Verification

- `pnpm.cmd --filter shared build`
- `pnpm.cmd --filter client test interest`
- `pnpm.cmd --filter server typecheck`
- `pnpm.cmd --filter client typecheck`
