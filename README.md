# Mini Kanban

A multi-tenant Kanban board with token auth, board sharing with roles, and a
task-movement API built for **order consistency under concurrency**. Boards are
shareable; every authorization check happens on the server, per resource; and
task position is a fractional index so a drag touches exactly one row.

> **The interesting part** is the move endpoint
> ([`tasks.service.ts`](apps/api/src/modules/tasks/tasks.service.ts)) — a
> transaction + a `FOR UPDATE` board lock + a fractional index + a unique
> constraint. The reasoning is in
> [docs/architecture.md](docs/architecture.md).

**Stack:** Next.js 14 (App Router, TS) · NestJS 10 (TS) · PostgreSQL 16 +
Prisma · Docker · Tailwind

---

## Quick start (Docker — the reviewer path)

```bash
git clone <repo> mini-kanban && cd mini-kanban
cp .env.example .env
docker compose up --build
```

Then open **http://localhost:3000** and sign in with a seeded account (below).
The API waits for a healthy Postgres, runs migrations, and seeds a populated
shared board before serving — so the first `up` just works.

- Web: http://localhost:3000
- API: http://localhost:4000
- Swagger: http://localhost:4000/api/docs

### Seeded accounts

The seed creates one shared board (**Product Launch**, 3 columns, 8 tasks) so
you can test sharing immediately:

| Email | Password | Role on the shared board |
|---|---|---|
| `ada@example.com` | `password123` | OWNER |
| `grace@example.com` | `password123` | EDITOR |

Log in as Ada, open **Share**, and you'll see Grace already has edit access.

## Manual start (without Docker)

Requires Node 20+ and a Postgres 16 instance.

```bash
# 1. Database (or bring your own and set DATABASE_URL)
docker compose up -d db

# 2. API
cd apps/api
npm install
cp ../../.env.example .env          # ensure DATABASE_URL points at your DB
npx prisma migrate dev              # creates the schema
npm run prisma:seed                 # two accounts + a shared board
npm run start:dev                   # http://localhost:4000

# 3. Web (new terminal)
cd apps/web
npm install
echo 'NEXT_PUBLIC_API_URL=http://localhost:4000' > .env.local
npm run dev                         # http://localhost:3000
```

## Environment

Mirror of [`.env.example`](.env.example):

| Var | Example | Used by |
|---|---|---|
| `DATABASE_URL` | `postgresql://kanban:kanban@localhost:5432/kanban?schema=public` | api |
| `JWT_SECRET` | 32+ char random string | api |
| `JWT_ACCESS_TTL` | `15m` | api |
| `JWT_REFRESH_SECRET` | 32+ char random string | api |
| `JWT_REFRESH_TTL` | `7d` | api |
| `CORS_ORIGIN` | `http://localhost:3000` | api |
| `NEXT_PUBLIC_API_URL` | `http://localhost:4000` | web (build + runtime) |

The API validates its environment on boot and **crashes with a readable message**
if a required var is missing.

---

## Schema

```
User ──< BoardMember >── Board ──< Column ──< Task
                                                 │
                          Task.createdById ──────┘  (SetNull on user delete)

User        id · email(unique) · name · passwordHash · createdAt
Board       id · title · createdAt · updatedAt
BoardMember id · boardId · userId · role(OWNER|EDITOR|VIEWER)   @@unique(boardId,userId)
Column      id · boardId · title · position                     @@unique(boardId,position)
Task        id · columnId · title · description? · position     @@unique(columnId,position)
```

Full detail: [docs/architecture.md](docs/architecture.md). Endpoint table:
[docs/api.md](docs/api.md) (or the live Swagger at `/api/docs`).

---

## Design decisions

### 1. Fractional indexing over integer positions

`position` is a lexicographic string (`"a0"`, `"a1"`, `"a0V"`), the same idea as
Jira's LexoRank. Moving a task reads its two would-be neighbours and generates a
key strictly between them:

| Approach | Writes per move |
|---|---|
| Dense integers (`0,1,2`) | **O(n)** — rewrite everything after the insert point |
| Fractional index | **O(1)** — exactly one row, wherever it lands |

The client sends an **index**; the server owns key generation. One tested
implementation (`OrderingService`) serves both task and column moves.

### 2. Order consistency survives concurrent moves

The move runs in a transaction that takes a `SELECT … FOR UPDATE` lock on the
**board row**. Two simultaneous drags are serialized: the second waits, re-reads
the post-commit neighbours, and lands in a real gap. `@@unique([columnId,
position])` is the backstop — any bug that produced a duplicate slot fails the
write instead of silently corrupting order. Proven by an e2e test that fires two
moves at once and asserts both succeed with unique, ordered positions.

### 3. `BoardMember` table, and 404-not-403

Sharing needs a membership table with a role, not an `ownerId` column — so every
permission check is one query against one table. A board you're **not** a member
of returns **404, not 403**: a 403 would confirm the id exists and leak other
users' data. Authorization always resolves up to the board (`task → column →
board`) and never trusts a `boardId` from the request body.

### 4. Token strategy (named trade-off)

Access token (JWT, 15 min) + refresh token (7 days). The **access token lives in
memory** and the **refresh token in `localStorage`**; a page reload silently
exchanges it via `POST /auth/refresh`. In-memory Bearer avoids CSRF entirely and
can't be read across a reload; the refresh token in storage is the pragmatic
concession that keeps you logged in. The production shape — httpOnly cookie +
refresh-token **rotation** with reuse detection — is the "what I'd do next" item.

### 5. `GET /boards/:id` returns the whole tree

Columns + tasks + members, ordered, in one round trip — the board renders
without N+1 fetching per column. `move` is a dedicated endpoint (not a generic
task update) because it has different validation, locking, and permission
semantics.

---

## Frontend notes

- **Optimistic drag-and-drop** with TanStack Query: `onMutate` snapshots the
  cache and applies the move via a pure `applyMoveLocally`; `onError` restores
  the snapshot and toasts; `onSettled` invalidates so the server stays the
  source of truth. In-flight refetches are cancelled so a stale response can't
  overwrite the optimistic state.
- **dnd-kit** with pointer **and keyboard** sensors (Space to lift, arrows to
  move, Space to drop), `closestCorners` collision, a tilted `DragOverlay`, and
  a dashed placeholder in empty lanes. `activationConstraint: { distance: 6 }`
  so clicking a card to open it doesn't start a drag.
- **Role-aware UI**: viewers see a "View only" chip and no composers, rather
  than buttons that 403.
- **Mobile**: one lane at a time with a segmented switcher and a "Move to…"
  select (same move endpoint) — no janky touch-drag.
- Skeleton board while loading, `prefers-reduced-motion` respected.

### Visual direction — "Blueprint"

A drafting table, not a stack of sticky notes: a faint graph-paper canvas,
hairline lane rules, cards flat at rest, and **elevation reserved exclusively for
the card being dragged** — so a shadow means "in motion". Design tokens live in
[`globals.css`](apps/web/src/styles/globals.css); dark mode is a single token
swap.

---

## Tests

```bash
# API unit (ordering algorithm) + e2e (move + access control)
cd apps/api
npm test                            # OrderingService unit tests
npm run test:e2e                    # needs a running Postgres (docker compose up -d db)

# Web unit (pure reorder logic)
cd apps/web
npm test
```

The e2e suite covers: same-column up/down reorder, cross-column moves, index
clamping, cross-board rejection, viewer-forbidden, **two concurrent moves**, plus
the access-control matrix (404-not-403, role enforcement, every sharing edge
case).

---

## Trade-offs & what I'd do next

- **Per-column locks** in deterministic id order instead of a board-level lock,
  for higher write concurrency at scale.
- **Refresh-token rotation** + reuse detection (today refresh is stateless).
- **WebSocket** board rooms for live collaboration — broadcast the changed task,
  clients patch their cache. The ordering model already converges.
- A background **position-rebalance** job if keys ever grow long.
- Activity log, task assignees / due dates, soft deletes.

## Repo layout

```
mini-kanban/
├─ apps/
│  ├─ api/   # NestJS · Prisma · modules/{auth,boards,columns,tasks,ordering,users}
│  └─ web/   # Next.js · components/{board,ui} · features/boards · lib
├─ docker-compose.yml
├─ .env.example
└─ docs/     # architecture.md (schema + ordering) · api.md (endpoints)
```
