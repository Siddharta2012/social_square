# State Model

## Redis

Transient world state lives in Redis and is safe to rebuild from active clients.

| Key | Type | Owner | TTL / cleanup |
| --- | --- | --- | --- |
| `room:{roomId}:users` | hash | `StateService` | 1 hour, refreshed on add/move/pose/held-item updates; deleted when the room becomes empty. |
| `room:{roomId}:objects` | hash | `StateService` | 1 hour, refreshed on object updates; deleted when the room becomes empty. |
| `wallet:petal:{userId}:{locationId}:{point}` | string | `StateService.reservePetalCollect` | Millisecond cooldown matching the petal spawn interval. |

Pool, jukebox, waiter, and seat state are entries in `room:{roomId}:objects`.
They are transient: when the room empties, the object hash is removed. Active
pool and jukebox sessions also carry `expiresAt`; normalizers treat expired
sessions as inactive on the next read.

## Postgres

Schema migrations live in `scripts/migrations` and are applied in filename order.
`scripts/migrations/0001_init.sql` builds the durable account, wallet ledger,
moderation/session, progression, social, and room tables. Run:

```bash
pnpm --filter server migrate
```

The runner records applied versions in `schema_migrations` and skips versions
that already ran.

Postgres is the source of truth for account and economy state:

| Table | Purpose |
| --- | --- |
| `users` | Identity, profile, avatar, persistent position, unlocked items, stats, and denormalized petal balance. |
| `petal_ledger` | Append-only petal deltas with `ref_id` idempotency and `balance_after`. |
| `auth_sessions` | Revocable login sessions used by the auth hardening work. |
| `user_blocks`, `moderation_reports`, `moderation_audit_log` | Persistent moderation and safety records. |
| `friendships`, `user_progress` | Social graph and progression state. |

Legacy Redis account blobs can be imported once after running migrations:

```bash
pnpm --filter server import:redis-users
```

The importer scans `user:id:*`, writes/upserts rows in `users`, and creates an
initial `petal_ledger` entry for any imported balance. After the cutover, Redis
must not contain account or wallet source-of-truth fields.
