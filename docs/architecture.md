# Architecture & Design Decisions

This document explains the schema and the ordering design — the two things that
carry the most weight in this exercise. If you only read one file before the
interview, read this one.

## System shape

```
┌──────────────────────────┐        ┌──────────────────────────┐
│  Next.js (apps/web)      │        │  NestJS (apps/api)       │
│  · App Router, RSC shell │  HTTP  │  · JwtAuthGuard (global) │
│  · TanStack Query cache  │ ─────► │  · BoardRoleGuard        │
│  · dnd-kit interactions  │  JSON  │  · Services + Prisma     │
│  · optimistic move       │        │  · TX + row lock on move │
└──────────────────────────┘        └────────────┬─────────────┘
                                                 │ Prisma
                                        ┌────────▼─────────┐
                                        │  PostgreSQL 16   │
                                        └──────────────────┘
```

## Data model

```
User ──< BoardMember >── Board ──< Column ──< Task
                                                 │
                          Task.createdById ──────┘ (SetNull)
```

```prisma
User        { id, email(unique), name, passwordHash, createdAt }
Board       { id, title, createdAt, updatedAt }
BoardMember { id, boardId, userId, role(OWNER|EDITOR|VIEWER), addedAt
              @@unique([boardId, userId]) @@index([userId]) }
Column      { id, boardId, title, position
              @@unique([boardId, position]) @@index([boardId]) }
Task        { id, columnId, title, description?, position, createdById?
              @@unique([columnId, position]) @@index([columnId, position]) }
```

### Why these decisions

1. **Membership is a table, not a column.** `Board.ownerId` alone can't express
   sharing. `BoardMember` carries a role, and the owner gets a row with role
   `OWNER` too — so *every* permission check is a single query against one
   table, with no special-casing of "is this the owner?".

2. **`position` is a string, not an integer** — a fractional (lexicographic)
   index. See below.

3. **`@@unique([columnId, position])` / `@@unique([boardId, position])`.** Order
   consistency isn't only enforced by application logic — a buggy or racing
   write fails loudly at the database instead of silently producing duplicate
   slots. It's the backstop behind the row lock.

4. **`@@index([columnId, position])`** powers `ORDER BY position` without a sort
   step.

5. **Cascade deletes** board → column → task, so removing a board is one delete.
   `Task.createdById` is `SetNull` so deleting a user doesn't erase history.

6. **UUID ids**, safe to expose in URLs — no enumeration of other users' boards.

## Task ordering — the core

### The options

| Approach | Move cost | Problem |
|---|---|---|
| Dense integers `0,1,2` | rewrite every task after the insert point | O(n) writes/drag; concurrent moves interleave |
| Sparse integers `1000,2000` + midpoint | usually 1 write | gaps run out (~10 inserts in a slot) → rebalance |
| **Fractional index** `"a0","a1","a0V"` | **always exactly 1 write** | keys grow slowly in length |

We use **fractional indexing** (`fractional-indexing`, the LexoRank/Figma idea).
One row is touched per move, wherever the task lands.

```
generateKeyBetween(null, null) // 'a0'  first item in an empty column
generateKeyBetween('a0', null) // 'a1'  append
generateKeyBetween(null, 'a0') // 'Zz'  prepend
generateKeyBetween('a0', 'a1') // 'a0V' squeeze between two neighbours
```

All of this lives in one tested place: `OrderingService`
(`src/modules/ordering/`), used by both task and column moves.

### The move endpoint

```
PATCH /tasks/:taskId/move
{ "targetColumnId": "uuid", "targetIndex": 2 }
→ 200 { id, columnId, position }
```

**Index in, fractional key out.** The client sends the integer index a drag
naturally produces; the server owns position generation entirely. That
separation is what makes the endpoint safe.

`TasksService.move` runs inside one transaction and does exactly this:

1. Resolve the task → its column → its **board**.
2. **Authorize inside the transaction**, on the resolved board — the thing we
   checked is the thing we mutate.
3. `SELECT id FROM "Board" WHERE id = $1 FOR UPDATE` — serialize every move on
   this board.
4. Verify the **target column belongs to the same board** — blocks cross-board
   moves even if the client sends a foreign column id.
5. Read neighbours in the target column **excluding the moved task**, clamp the
   index, and generate one key between the two neighbours.
6. **One write.**

Why each matters:

- **Excluding the moved task** is what makes same-column reordering correct.
  Forget it and dragging a task down one slot puts it back where it started —
  the single most common bug in this exercise. There's a dedicated e2e test.
- **Clamping the index** turns a hostile `targetIndex: 9999` into "last" instead
  of a crash.
- **`FOR UPDATE` on the board row** is the concurrency answer. Two users
  dragging at once would otherwise read the same neighbour pair, generate the
  same key, and one write would explode on `@@unique([columnId, position])`. The
  lock makes the second transaction wait, re-read post-commit neighbours, and
  land in a real gap. Board-level granularity is coarse but correct, and a board
  is a small unit of contention.
- **Authorizing inside the transaction**, after resolving the board from the
  task, is the only way to be sure the thing checked is the thing mutated.

> Note: `Board.id` is a `text` column (Prisma `String @default(uuid())`), so the
> lock query compares text-to-text — **no `::uuid` cast**, which would fail with
> `operator does not exist: text = uuid`. (Caught by the concurrency e2e test.)

### Concurrency, proven

`test/tasks-move.e2e-spec.ts` fires two moves into the same gap with
`Promise.all` and asserts both return 200 and that positions stay unique and
ordered. That test is worth more than any three extra features.

## Access control

Three rules make authorization airtight:

1. **Always resolve up to the board.** For a task that's `task → column →
   board`. A `boardId` in the request body is never trusted.
2. **404, not 403, for boards you're not a member of.** A 403 confirms the id is
   real and leaks the existence of other users' data. A non-member gets the same
   response as a nonexistent id.
3. **Filter list queries by membership in SQL**
   (`where: { members: { some: { userId } } }`), never in JS.

`BoardAccessService` is the single decision point. Controller routes that carry
`:boardId` can authorize at the edge with `BoardRoleGuard` + `@BoardRoles(...)`;
nested resources (`columns/:id`, `tasks/:id`) resolve the chain in the service,
where the board can actually be reached.

Roles: `OWNER` (everything incl. sharing/delete), `EDITOR` (mutate
columns/tasks), `VIEWER` (read only).

## What I'd do next

- Per-column locks acquired in deterministic id order, instead of a board-level
  lock, for higher write concurrency.
- Refresh-token **rotation** + reuse detection (today refresh is stateless).
- A background **rebalance job** to shorten position keys if they ever grow.
- WebSocket board rooms: broadcast the changed task after a move; clients patch
  their Query cache instead of refetching. The ordering model already converges
  because the server owns position generation.
- Activity log, task assignees/due dates, soft deletes.
