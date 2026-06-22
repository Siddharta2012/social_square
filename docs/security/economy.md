# Economy Authority Audit

All wallet mutations are server-side. The client may optimistically render some
actions, but balances are reconciled from authoritative `account-updated` or
domain-specific replies.

| Action | Authority | Idempotency | Rate limit | Notes |
| --- | --- | --- | --- | --- |
| Petal collect | Server `StateService.reservePetalCollect` + `UserService.awardPetals` | Per user/location/point cooldown key blocks replay | `petal` bucket, includes `requestId` on every optimistic failure | Client optimism is reconciled by absolute petal totals. |
| Counter pickup | Server `UserService.spendPetals` | One spend per accepted `pickup-item` | `interact` bucket | Grants held item only after spend succeeds. |
| Waiter order | Server `UserService.spendPetals` | One spend when waiter is in `awaiting-order` for the user | `interact` bucket plus waiter phase/queue guards | Order flow is bound to `customerId`. |
| Jukebox play | Server `UserService.spendPetals` | Active paid play locks further starts until expiry | `interact` bucket | External YouTube input is normalized and allowlisted. |
| Pool start/join | Server `UserService.spendPetals` | Existing players cannot join twice; busy tables reject new starts | `interact` bucket | Server owns scores/outcomes at `pool-sync`. |
| Pool shot/sync | Server validates turn, last-shot owner, parsed balls, and max new pots | Out-of-turn or out-of-sequence sync rejected | `interact` bucket | Residual trust: client still reports final ball positions and scratch; server recomputes scoring from the diff and bounds implausible pots. |

Known invariant: every petal collect error that can clear an optimistic pending
entry emits the original `requestId`.

Deploy/runtime guardrail: profile reads and wallet mutations repair `users.petals`
from the ledger if the ledger is ahead. Legacy Redis account blobs are imported
only through the documented one-shot `pnpm --filter server import:redis-users`
script before cutover; runtime services do not read account or wallet fields from
Redis.
