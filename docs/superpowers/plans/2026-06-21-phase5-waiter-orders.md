# Phase 5 - Camerieri Bot e Ordinazioni

Date: 2026-06-21
Status: implemented

## Scope

- Add a server-side waiter bot as a synchronized room object.
- Add a simple state machine:
  - `idle`;
  - `approaching` the player;
  - `awaiting-order`;
  - `to-counter`;
  - `delivering`;
  - `delivered`;
  - `returning`.
- Add ordering UI:
  - `Cameriere` button in the room HUD;
  - menu shown when the waiter reaches the player;
  - beer/pretzel order selection.
- Render the waiter as a special avatar named `Cameriere`.
- Deliver the ordered item into the local player's hand and sync it through the existing
  held-item event.

## Notes

- Waiter state is persisted in room object state via `object-state-changed`, so joining
  clients can reconstruct the current bot state.
- The movement loop is server-driven and emits small object-state position updates.
- Phase 4 jukebox work was already implemented during the urgent interaction pass.

## Verification

- `pnpm.cmd --filter client typecheck`
- `pnpm.cmd --filter client test`
- `pnpm.cmd build`
- Runtime smoke:
  - enter the bar;
  - click `Cameriere`;
  - wait for the waiter to arrive;
  - choose beer/pretzel;
  - verify the waiter visits the counter and delivers the item;
  - verify the local avatar receives the item in hand.
