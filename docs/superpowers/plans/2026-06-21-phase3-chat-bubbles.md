# Phase 3 - Chat Testuale e Bolle

Date: 2026-06-21
Status: implemented

## Scope

- Add a room chat socket channel:
  - client emits `chat-message`;
  - server validates, normalizes, and broadcasts `user-chat-message`.
- Add HUD chat:
  - compact input in-room;
  - send with Enter or the `Invia` button;
  - recent message history.
- Add avatar speech bubbles:
  - local and remote avatars show the latest message;
  - bubbles follow avatar position and fade automatically.

## Notes

- Messages are capped at 160 characters and whitespace-normalized.
- HUD history is client-side and capped at 24 messages.
- Chat input focus naturally blocks WASD/arrow movement through the existing DOM focus guard.

## Verification

- `pnpm.cmd --filter client typecheck`
- `pnpm.cmd --filter client test`
- `pnpm.cmd build`
- Runtime smoke:
  - enter the bar;
  - send a chat message;
  - verify it appears in HUD history;
  - verify a bubble appears above the local avatar;
  - verify no console errors during chat input and send.
