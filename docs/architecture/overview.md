# Architecture Overview

## Monorepo

- `apps/client` owns rendering and local interaction: Phaser world, React HUD,
  audio/voice UI, optimistic petal feedback, pool overlay, and client-side input.
- `apps/server` owns authority: room membership, interest-filtered broadcasts,
  wallet mutations, pool scoring resolution, jukebox/waiter state, auth, and
  health/readiness.
- `packages/shared` owns contracts and pure logic: Socket.IO event types,
  constants, interest math, interaction helpers, jukebox parsing, and pool rules.

## Socket Flow

1. Client connects with JWT auth.
2. Server middleware validates the token and fills `socket.data`.
3. Client emits `join-room`.
4. Server stores presence in Redis and sends an authoritative `room-state`
   snapshot filtered to the viewer's interest sector.
5. Movement, emotes, held items, chat, and object state changes are broadcast only
   to interested peers.
6. On reconnect, the client re-emits `join-room` and reconciles remotes from the
   full snapshot.

## Economy Flow

Wallet changes never trust the client. Counter purchases, waiter orders, jukebox
plays, pool sessions, and petal awards all call `UserService` on the server.
Petal collection uses request IDs so optimistic UI can reconcile exact failures.

## State

Redis stores transient room state and persistent account records. Postgres schema
migrations are available for the relational baseline. See `state.md`.
