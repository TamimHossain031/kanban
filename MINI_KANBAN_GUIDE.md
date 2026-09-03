# Mini Kanban Board — Build Guide (Webbriks Assessment)

**Stack:** Next.js (App Router, TS) · NestJS (TS) · PostgreSQL + Prisma · Docker · Tailwind
**Timeframe:** 4 days
**Goal:** not just "it works" — a repo that *reads* like it was built by someone who has shipped multi-tenant software, and that you can defend line-by-line in an interview.

---

## 0. What they are actually testing

The task looks like CRUD. It isn't. Four things carry almost all the marks:

| Requirement | What they are really checking |
|---|---|
| Token-based auth | Do you hash passwords properly, and is the token verified on *every* request? |
| Board sharing + access control | Is authorization checked on the **server**, per resource, including nested resources (task → column → board)? |
| Task movement API | Your **ordering algorithm** and whether it survives concurrency |
| Order consistency | Transactions, locking, uniqueness constraints — the senior-level signal |

Everything else (UI polish, Docker, README) is what makes them *want* to hire you after they've decided you're competent.

The single highest-value thing in this repo is the move endpoint plus a paragraph in the README explaining why you designed it that way. Spend your best hours there.

---

## 1. Architecture at a glance

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

**Repo layout (single repository, as required):**

```
mini-kanban/
├─ apps/
│  ├─ api/                 # NestJS
│  └─ web/                 # Next.js
├─ docker-compose.yml
├─ .env.example
├─ README.md
└─ docs/
   ├─ architecture.md      # schema + ordering decision (interview gold)
   └─ api.md              # endpoint table
```

Keep it a plain two-folder repo. Do **not** reach for Turborepo/Nx — reviewers have to run it in 5 minutes, and a broken monorepo pipeline costs you more than a shared types package gains you. Share types by copying a small `types.ts`, or generate from the API's OpenAPI output if you have time on day 4.

---

## 2. Data model

### Decisions to make up front

1. **Membership is a table, not a column.** `Board.ownerId` alone can't express sharing. Use an explicit `BoardMember` join table with a role. The owner also gets a `BoardMember` row with role `OWNER` — that way *every* permission check is one query against one table, with no special-casing.
2. **Position is a string, not an integer.** See §3.
3. **Cascade deletes** on board → column → task so cleanup is a single delete.
4. **UUIDs** for ids — safe to expose in URLs, no enumeration of other users' boards.

### `apps/api/prisma/schema.prisma`

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum BoardRole {
  OWNER
  EDITOR
  VIEWER
}

model User {
  id           String        @id @default(uuid())
  email        String        @unique
  name         String
  passwordHash String
  createdAt    DateTime      @default(now())
  memberships  BoardMember[]
  createdTasks Task[]        @relation("TaskCreator")
}

model Board {
  id        String        @id @default(uuid())
  title     String
  createdAt DateTime      @default(now())
  updatedAt DateTime      @updatedAt
  members   BoardMember[]
  columns   Column[]
}

model BoardMember {
  id      String    @id @default(uuid())
  boardId String
  userId  String
  role    BoardRole @default(VIEWER)
  addedAt DateTime  @default(now())

  board Board @relation(fields: [boardId], references: [id], onDelete: Cascade)
  user  User  @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([boardId, userId])   // one membership per user per board
  @@index([userId])             // "list my boards" is driven from here
}

model Column {
  id       String @id @default(uuid())
  boardId  String
  title    String
  position String                // fractional index

  board Board  @relation(fields: [boardId], references: [id], onDelete: Cascade)
  tasks Task[]

  @@unique([boardId, position])
  @@index([boardId])
}

model Task {
  id          String   @id @default(uuid())
  columnId    String
  title       String
  description String?
  position    String
  createdById String?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  column    Column @relation(fields: [columnId], references: [id], onDelete: Cascade)
  createdBy User?  @relation("TaskCreator", fields: [createdById], references: [id], onDelete: SetNull)

  @@unique([columnId, position])   // DB-level guarantee: no two tasks share a slot
  @@index([columnId, position])    // powers ORDER BY position without a sort
}
```

> **Talking point:** `@@unique([columnId, position])` means order consistency isn't only enforced by application logic — a buggy or racing write fails loudly at the database instead of silently producing duplicate positions. Say this out loud in the interview.

> **Note if you're coming from MySQL:** Postgres gives you real `enum` types, `uuid` defaults, and `SELECT … FOR UPDATE` row locks that Prisma can issue through `$queryRaw`. The locking in §3 depends on that.

---

## 3. Task ordering — the core of the assessment

### The three options, and why you pick one

| Approach | Move cost | Problem |
|---|---|---|
| Dense integers `0,1,2,3` | rewrite every task after the insert point | O(n) writes per drag; two concurrent moves interleave into a mess |
| Sparse integers (`1000, 2000, 3000`) then midpoint | 1 write, usually | gaps run out after ~10 inserts in the same slot → needs periodic rebalance |
| **Fractional / lexicographic index** (`"a0"`, `"a1"`, `"a0V"`) | **always exactly 1 write** | keys grow slowly in length; needs a tested key generator |

Pick **fractional indexing** using the `fractional-indexing` npm package (the same idea as Jira's LexoRank and Figma's ordering). One row is touched per move, no matter where the task lands.

```bash
npm i fractional-indexing
```

```ts
import { generateKeyBetween } from 'fractional-indexing';

generateKeyBetween(null, null);   // 'a0'  → first task in an empty column
generateKeyBetween('a0', null);   // 'a1'  → append
generateKeyBetween(null, 'a0');   // 'Zz'  → prepend
generateKeyBetween('a0', 'a1');   // 'a0V' → squeeze between two neighbours
```

### The API contract

The brief says "moving a task to a specific position index", so accept an index — that's also what a drag-and-drop UI naturally produces:

```
PATCH /tasks/:taskId/move
{ "targetColumnId": "uuid", "targetIndex": 2 }
→ 200 { id, columnId, position }
```

Index in, fractional key out. The client never sees or computes positions; the server owns ordering. That separation is what makes the endpoint safe.

### Implementation

```ts
// apps/api/src/modules/tasks/tasks.service.ts
async moveTask(userId: string, taskId: string, dto: MoveTaskDto) {
  return this.prisma.$transaction(async (tx) => {
    // 1. Resolve the task and the board it belongs to
    const task = await tx.task.findUnique({
      where: { id: taskId },
      select: { id: true, columnId: true, column: { select: { boardId: true } } },
    });
    if (!task) throw new NotFoundException('Task not found');
    const boardId = task.column.boardId;

    // 2. Authorize inside the transaction, on the resolved board
    await this.access.assertCanMutate(tx, userId, boardId);

    // 3. Serialize all moves on this board (prevents interleaved neighbour reads)
    await tx.$queryRaw`SELECT id FROM "Board" WHERE id = ${boardId}::uuid FOR UPDATE`;

    // 4. Target column must belong to the SAME board — blocks cross-board moves
    const target = await tx.column.findUnique({
      where: { id: dto.targetColumnId },
      select: { id: true, boardId: true },
    });
    if (!target) throw new NotFoundException('Column not found');
    if (target.boardId !== boardId) {
      throw new ForbiddenException('Cannot move a task to another board');
    }

    // 5. Read neighbours, excluding the task being moved
    const siblings = await tx.task.findMany({
      where: { columnId: target.id, id: { not: taskId } },
      orderBy: { position: 'asc' },
      select: { position: true },
    });

    const index = Math.min(Math.max(dto.targetIndex, 0), siblings.length); // clamp
    const prev = siblings[index - 1]?.position ?? null;
    const next = siblings[index]?.position ?? null;

    // 6. One write
    return tx.task.update({
      where: { id: taskId },
      data: { columnId: target.id, position: generateKeyBetween(prev, next) },
      select: { id: true, columnId: true, position: true, updatedAt: true },
    });
  });
}
```

**Why each line earns its place:**

- **Excluding the moved task** from `siblings` is what makes same-column reordering correct. Forget it and dragging a task down one slot puts it back where it started — the single most common bug in this exercise.
- **Clamping the index** turns a hostile `targetIndex: 9999` into "last", instead of a crash.
- **`FOR UPDATE` on the board row** is the concurrency answer. Two users dragging at the same moment would otherwise both read the same neighbour pair, generate the same key, and one write would explode on the unique constraint. The lock makes the second transaction wait, re-read, and land in a real gap. Board-level granularity is coarse but correct, and a board is a small unit of contention.
- **Authorization inside the transaction**, after resolving the board from the task, is the only way to be sure the thing you checked is the thing you mutated.

### Ordering utilities you'll also need

```ts
// creating a task: append to the end of a column
const last = await tx.task.findFirst({
  where: { columnId },
  orderBy: { position: 'desc' },
  select: { position: true },
});
const position = generateKeyBetween(last?.position ?? null, null);
```

Columns are reordered with exactly the same algorithm (`PATCH /columns/:id/move`). Extract it into an `OrderingService` so both use one tested implementation.

---

## 4. Auth & access control

### Auth

- Hash with **argon2** (`npm i argon2`), or bcrypt with cost 12. Never store plaintext, never MD5/SHA.
- **Access token** (JWT, 15 min) + **refresh token** (7 days). If you're short on time, one 1-hour access token is acceptable — but say in the README that refresh rotation is the production shape. A stated trade-off reads as judgment; an unstated gap reads as ignorance.
- Storage: httpOnly cookie is the safer answer (XSS can't read it) but needs CSRF protection and correct `sameSite` in Docker. `Authorization: Bearer` from memory + a refresh call on load is simpler and perfectly defensible for an assessment. Pick one, write down why.
- Global guard, opt out explicitly:

```ts
// main.ts / app.module.ts
providers: [{ provide: APP_GUARD, useClass: JwtAuthGuard }]

// auth.controller.ts
@Public()
@Post('login')
```

Secure-by-default beats decorating every controller with `@UseGuards` and forgetting one.

- Validate every payload: `app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }))` with `class-validator` DTOs.
- Never return `passwordHash`. Use `select` in Prisma or a serialization interceptor — a leaked hash in a JSON response is an instant fail.

### Access control

Roles: `OWNER` (everything, incl. sharing and delete), `EDITOR` (mutate columns/tasks), `VIEWER` (read only).

One service, used everywhere:

```ts
// apps/api/src/modules/boards/board-access.service.ts
@Injectable()
export class BoardAccessService {
  async requireRole(
    db: Prisma.TransactionClient | PrismaService,
    userId: string,
    boardId: string,
    allowed: BoardRole[],
  ) {
    const membership = await db.boardMember.findUnique({
      where: { boardId_userId: { boardId, userId } },
      select: { role: true },
    });
    // 404, not 403 — don't confirm the board exists to a stranger
    if (!membership) throw new NotFoundException('Board not found');
    if (!allowed.includes(membership.role)) {
      throw new ForbiddenException('Insufficient permissions on this board');
    }
    return membership.role;
  }

  assertCanMutate = (db, userId, boardId) =>
    this.requireRole(db, userId, boardId, ['OWNER', 'EDITOR']);

  assertCanRead = (db, userId, boardId) =>
    this.requireRole(db, userId, boardId, ['OWNER', 'EDITOR', 'VIEWER']);
}
```

Three rules that make this airtight:

1. **Always resolve up to the board.** For a task, that's `task → column → board`. Never trust a `boardId` sent in the body.
2. **Return 404 for boards you're not a member of.** Returning 403 tells an attacker the id is real. Mention this — reviewers notice.
3. **Filter list queries by membership,** don't filter in JS:

```ts
this.prisma.board.findMany({
  where: { members: { some: { userId } } },
  include: { _count: { select: { columns: true, members: true } } },
});
```

For controller-level checks where `boardId` is a route param, a small `BoardRoleGuard` + `@BoardRoles('OWNER')` decorator keeps controllers clean. For nested resources, do it in the service where you can resolve the chain.

### Sharing

```
POST   /boards/:boardId/members    { email, role }   # OWNER only
PATCH  /boards/:boardId/members/:userId  { role }    # OWNER only
DELETE /boards/:boardId/members/:userId              # OWNER only
```

Edge cases to handle (each is a likely interview question): inviting an email that isn't registered → 404 with a clear message; inviting an existing member → 409; the owner removing themselves → 400; changing the last owner's role → 400.

---

## 5. API surface

| Method | Path | Role | Notes |
|---|---|---|---|
| POST | `/auth/register` | public | returns tokens + user |
| POST | `/auth/login` | public | |
| POST | `/auth/refresh` | public | if you implement refresh |
| GET | `/auth/me` | any | hydrate the client |
| GET | `/boards` | member | boards I can see |
| POST | `/boards` | any | creator gets `OWNER` membership in the same TX |
| GET | `/boards/:id` | member | **full board tree**: columns + tasks + members, one request |
| PATCH/DELETE | `/boards/:id` | owner | |
| POST | `/boards/:id/members` | owner | sharing |
| POST | `/boards/:id/columns` | editor | |
| PATCH/DELETE | `/columns/:id` | editor | |
| PATCH | `/columns/:id/move` | editor | `{ targetIndex }` |
| POST | `/columns/:id/tasks` | editor | appends to end |
| PATCH/DELETE | `/tasks/:id` | editor | |
| **PATCH** | **`/tasks/:id/move`** | editor | `{ targetColumnId, targetIndex }` |

Two API choices worth defending: `GET /boards/:id` returns the whole tree ordered by `position` (one round trip renders the board — no N+1 fetching per column), and move is a dedicated `PATCH …/move` rather than a generic task update, because moving has different validation, locking, and permission semantics than editing a title.

Add Swagger (`@nestjs/swagger`) at `/api/docs`. It costs 30 minutes and makes the reviewer's evaluation effortless.

---

## 6. Backend structure

```
apps/api/
├─ prisma/
│  ├─ schema.prisma
│  ├─ migrations/
│  └─ seed.ts                    # 2 users, 1 shared board, 3 columns, ~8 tasks
├─ src/
│  ├─ main.ts                    # validation pipe, CORS, helmet, Swagger
│  ├─ app.module.ts
│  ├─ common/
│  │  ├─ decorators/  public.decorator.ts, current-user.decorator.ts, board-roles.decorator.ts
│  │  ├─ guards/      jwt-auth.guard.ts, board-role.guard.ts
│  │  ├─ filters/     prisma-exception.filter.ts   # P2002 → 409, P2025 → 404
│  │  └─ interceptors/ logging.interceptor.ts
│  ├─ prisma/         prisma.module.ts, prisma.service.ts
│  ├─ config/         env.validation.ts            # fail fast on missing env
│  └─ modules/
│     ├─ auth/        controller, service, strategies/{jwt,local}, dto/
│     ├─ users/       service (lookup by email for sharing)
│     ├─ boards/      controller, service, board-access.service.ts, dto/
│     ├─ columns/     controller, service, dto/
│     └─ tasks/       controller, service, dto/move-task.dto.ts
│     └─ ordering/    ordering.service.ts + ordering.service.spec.ts
└─ test/
   ├─ tasks-move.e2e-spec.ts     # ← the file they will open first
   └─ access-control.e2e-spec.ts
```

**Backend practices that show seniority**

- Thin controllers (HTTP only), logic in services, DB in Prisma. Controllers should be boring.
- A Prisma exception filter mapping `P2002 → 409 Conflict` and `P2025 → 404`, so the client never sees a raw Prisma error string.
- `envValidation` on boot: if `DATABASE_URL` or `JWT_SECRET` is missing, crash immediately with a readable message instead of failing on the first request.
- DTOs with `class-validator`: `@IsInt() @Min(0) targetIndex`, `@IsUUID() targetColumnId`.
- Rate-limit auth routes (`@nestjs/throttler`, 5 attempts/min).
- Seed script — reviewers should see a populated board on first load, and it gives them two accounts to test sharing with.

---

## 7. Frontend structure

```
apps/web/
├─ src/
│  ├─ app/
│  │  ├─ layout.tsx                    # fonts, providers
│  │  ├─ (auth)/login/page.tsx
│  │  ├─ (auth)/register/page.tsx
│  │  └─ (app)/
│  │     ├─ layout.tsx                 # auth gate + top bar
│  │     ├─ boards/page.tsx            # board list
│  │     └─ boards/[boardId]/page.tsx  # the board
│  ├─ components/
│  │  ├─ board/  BoardCanvas.tsx, ColumnLane.tsx, TaskCard.tsx,
│  │  │          TaskComposer.tsx, DragPreview.tsx, ShareDialog.tsx
│  │  └─ ui/     Button.tsx, Dialog.tsx, Avatar.tsx, Skeleton.tsx, Toast.tsx
│  ├─ features/boards/  api.ts, queries.ts, mutations.ts, types.ts, reorder.ts
│  ├─ lib/       api-client.ts (fetch wrapper + 401 refresh), auth-store.ts, cn.ts
│  └─ styles/    globals.css            # design tokens
```

**Libraries:** `@dnd-kit/core` + `@dnd-kit/sortable` (keyboard-accessible, unlike react-beautiful-dnd which is unmaintained and awkward in React 18 StrictMode), `@tanstack/react-query` (cache + optimistic updates + rollback), `react-hook-form` + `zod`, `sonner` for toasts. Skip a global state library — server state lives in Query, UI state in `useState`.

### Optimistic drag-and-drop

This is the frontend equivalent of the move endpoint. The board must never flicker.

```ts
// features/boards/mutations.ts
export function useMoveTask(boardId: string) {
  const qc = useQueryClient();
  const key = ['board', boardId];

  return useMutation({
    mutationFn: (v: MoveVars) => api.moveTask(v.taskId, {
      targetColumnId: v.targetColumnId,
      targetIndex: v.targetIndex,
    }),

    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: key });     // stop an in-flight refetch overwriting us
      const previous = qc.getQueryData<Board>(key);
      qc.setQueryData<Board>(key, (b) => b && applyMoveLocally(b, v));
      return { previous };
    },

    onError: (_e, _v, ctx) => {
      if (ctx?.previous) qc.setQueryData(key, ctx.previous);  // snap back
      toast.error('Could not move the task. Put back where it was.');
    },

    onSettled: () => qc.invalidateQueries({ queryKey: key }), // server is the truth
  });
}
```

`applyMoveLocally` is a pure function in `reorder.ts` — splice out of the source column, splice into the target at `targetIndex`. Pure, so you can unit test it, and reused for both same-column and cross-column moves.

**Details that separate a good submission from an average one**

- `DragOverlay` with a slight tilt + shadow while dragging, and a dashed placeholder in the empty slot — the user always knows where the card will land.
- `activationConstraint: { distance: 6 }` on the pointer sensor, so clicking a card to open it doesn't start a drag.
- Include `KeyboardSensor` and `sortableKeyboardCoordinates`. Space to lift, arrows to move, space to drop. Almost nobody does this in an assessment; mention it in the README.
- `useSensor` + `closestCorners` collision detection for columns (better than `closestCenter` for tall lanes).
- Optimistic create with a temp id, replaced on response.
- Skeleton board while loading, not a spinner.
- `prefers-reduced-motion` respected.

---

## 8. Visual direction — "Blueprint"

Most submissions ship the default Trello clone: grey background, white rounded cards, soft shadows everywhere. Here's a direction with an actual point of view.

**Concept:** a drafting table, not a stack of sticky notes. The board is a technical plan. Lanes are separated by hairline rules rather than heavy grey boxes, cards sit flat on the canvas, and *elevation is reserved exclusively for the card you're dragging* — so shadow means "in motion" rather than decoration.

### Tokens

```css
/* styles/globals.css */
:root {
  --canvas:      #EDF0F4;   /* cool paper */
  --surface:     #FFFFFF;   /* cards, lanes */
  --rule:        #D3DAE3;   /* hairlines, lane dividers */
  --ink:         #17212D;   /* primary text */
  --ink-muted:   #5B6B7C;   /* meta, counts */
  --accent:      #2F5DFF;   /* blueprint ink — focus, active drop target, primary CTA */
  --accent-wash: #E8EDFF;

  /* semantic spines only — not decoration */
  --spine-urgent: #D6455B;
  --spine-normal: #2F5DFF;
  --spine-idea:   #6E7A8A;
}
```

Dark mode (same structure, inverted): `--canvas: #121821`, `--surface: #1A222E`, `--rule: #2A3542`, `--ink: #E6ECF3`, `--accent: #7FA0FF`.

**Type:** one family — `Instrument Sans` (Google Fonts) at 3 weights: 400 body, 500 labels, 600 headings. Task titles 14px/1.4, column titles 13px/500 with the count as a muted numeral beside it. One family keeps a dense tool coherent; two would fight over a 280px card.

**The one bold move:** a faint 8px graph-paper grid on the canvas (`background-image` with two 1px `linear-gradient`s at `--rule` at 40% opacity). It reads as a drafting surface instantly, costs no JS, and lets the lanes float without needing shadows. Everything else stays quiet.

### Layout

```
┌────────────────────────────────────────────────────────────────┐
│ Kanban    Product Launch            ●●● members   [Share]  TA │  56px, bottom hairline
├────────────────────────────────────────────────────────────────┤
│ ░░ graph-paper canvas ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ │
│  ┌ Backlog     4 ┐│┌ In progress  2 ┐│┌ Review  1 ┐│┌  +  ┐   │
│  │ ▏Fix auth race││ │ ▏Move endpoint ││ │ ▏Schema │││ Add │   │
│  │  2 comments  T││ │  TA  today     ││ │         │││ list│   │
│  ├───────────────┤│ ├────────────────┤│ └─────────┘│└─────┘   │
│  │ ▏Seed script  ││ │ ┄┄ drop here ┄┄││                        │
│  └───────────────┘│ └────────────────┘│                        │
│  + Add card       │  + Add card       │                        │
└────────────────────────────────────────────────────────────────┘
        ▏ = 2px colour spine        │ = 1px lane rule
```

- Lanes: fixed 288px, `overflow-y: auto`, horizontal scroll on the canvas with `scroll-snap-type: x proximity`.
- Cards: `--surface`, 1px `--rule`, 6px radius, **no shadow at rest**. Left 2px colour spine carries meaning (priority), not decoration.
- Active drop target: lane background shifts to `--accent-wash` and its rule goes solid `--accent`. Nothing else animates.
- Dragging card: `rotate(1.5deg) scale(1.02)` + a real shadow. That's the only elevation in the app.
- Members: 24px initial-avatars, overlapped -6px, `+2` chip past three.
- Column header count in a tabular numeral so it doesn't jitter as tasks move.

### Empty and error states (write these, don't skip them)

- No boards: "No boards yet. Create one to start planning." + **Create board** button.
- Empty column: a dashed 1px `--rule` outline, 64px tall, with "Drop a card here" in `--ink-muted`.
- Move failed: toast "Could not move the task. Put back where it was." — states what happened and what the app did. No apology, no vagueness.
- Viewer role: hide composers entirely and show a small "View only" chip in the header, rather than showing buttons that 403.

### Mobile

Drag-and-drop on a 380px screen is a trap. Show one lane at a time with a segmented lane switcher and a "Move to…" action in the card menu that calls the same move endpoint. One tidy mobile path beats a janky touch-drag.

---

## 9. Docker

```yaml
# docker-compose.yml
services:
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: kanban
      POSTGRES_PASSWORD: kanban
      POSTGRES_DB: kanban
    ports: ['5432:5432']
    volumes: [pgdata:/var/lib/postgresql/data]
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U kanban']
      interval: 5s
      retries: 10

  api:
    build: { context: ./apps/api }
    environment:
      DATABASE_URL: postgresql://kanban:kanban@db:5432/kanban
      JWT_SECRET: dev-secret-change-me
      CORS_ORIGIN: http://localhost:3000
    ports: ['4000:4000']
    depends_on:
      db: { condition: service_healthy }
    command: sh -c "npx prisma migrate deploy && npx prisma db seed && node dist/main"

  web:
    build: { context: ./apps/web }
    environment:
      NEXT_PUBLIC_API_URL: http://localhost:4000
    ports: ['3000:3000']
    depends_on: [api]

volumes:
  pgdata:
```

Multi-stage Dockerfiles, `node:20-alpine`, non-root user, `npm ci`. The `depends_on: service_healthy` + `migrate deploy` in the command is what makes `docker compose up` actually work on the first try — which is the entire point of including Docker.

Test it the way a reviewer will: `git clone` into a fresh folder, `cp .env.example .env`, `docker compose up`, open localhost:3000, log in with the seeded account. If that isn't smooth, fix it before polishing anything else.

---

## 10. Four-day plan

### Day 1 — Foundation (backend)
- [ ] Repo, two apps, `.env.example`, `docker compose up db` working
- [ ] Prisma schema + first migration + seed script
- [ ] Auth: register, login, argon2, JWT strategy, global guard, `@Public()`, `/auth/me`
- [ ] Boards CRUD with membership-filtered queries; creator gets `OWNER` in the same transaction
- [ ] Validation pipe, Prisma exception filter, Swagger
- **Done when:** you can register two users and create a board with curl, and user B gets 404 on user A's board.

### Day 2 — The core (backend)
- [ ] `OrderingService` + unit tests (first, middle, end, empty column, single task)
- [ ] Columns CRUD + move
- [ ] Tasks CRUD (append on create)
- [ ] **`PATCH /tasks/:id/move`** with transaction + `FOR UPDATE` + cross-board guard
- [ ] `GET /boards/:id` full tree, ordered
- [ ] e2e tests: same-column up/down, cross-column, index clamping, cross-board rejection, viewer forbidden
- [ ] Sharing endpoints + their edge cases
- **Done when:** the move e2e suite is green. This is the day that decides the outcome.

### Day 3 — Frontend
- [ ] Tokens + layout shell, fonts, auth pages, api-client with 401 handling
- [ ] Board list + create
- [ ] Board view: lanes, cards, `GET /boards/:id`
- [ ] dnd-kit: pointer + keyboard sensors, `DragOverlay`, placeholder
- [ ] `useMoveTask` optimistic mutation + rollback + `applyMoveLocally` unit test
- [ ] Task create/edit/delete, column create/rename/delete
- [ ] Share dialog, member avatars, role-aware UI
- **Done when:** you can drag for two minutes straight, refresh, and the order is exactly what you left.

### Day 4 — Finish and defend
- [ ] Skeletons, empty states, toasts, focus rings, mobile lane switcher
- [ ] Dockerfiles + full `docker compose up` from a clean clone
- [ ] **README.md** (see §11) + `docs/architecture.md`
- [ ] Deploy if time allows: DB on Neon, API on Railway/Render, web on Vercel (~1h). Set CORS and `NEXT_PUBLIC_API_URL`.
- [ ] Re-read the brief line by line and tick every bullet
- [ ] Clean commit history — squash "wip" commits; reviewers read `git log`

**If you fall behind, cut in this order:** deployment → refresh tokens → column reordering → dark mode → mobile. **Never** cut: the move transaction, access control, the README, or `docker compose up` working.

---

## 11. README — what it must contain

Reviewers spend 3 minutes here before touching the code. Structure:

1. One-paragraph overview + a screenshot or short GIF of a drag (put it at the top; it does more than any prose)
2. Stack, and the live URL if deployed
3. **Quick start:** `docker compose up` path first, then the manual path (`npm i`, `prisma migrate dev`, `npm run start:dev`)
4. Sample env vars (mirror `.env.example`)
5. Seeded credentials — both accounts, so they can test sharing immediately
6. **Schema diagram** (a fenced ASCII ER diagram is fine)
7. **"Design decisions"** — the section that gets you the interview:
   - why fractional indexing over integer positions (with the O(n) vs O(1) comparison)
   - how order consistency survives concurrent moves (transaction + row lock + unique constraint)
   - why `BoardMember` instead of an owner column, and the 404-not-403 choice
   - token strategy and where tokens are stored, with the trade-off named
8. API table (or link to `/api/docs`)
9. **Trade-offs & what I'd do next:** WebSocket live updates, per-column locks instead of board-level, activity log, task assignees, soft deletes, position rebalance job. Naming your own gaps is a strength signal, not a weakness.
10. How to run the tests

---

## 12. Interview questions you should be able to answer cold

**Q: How does your task ordering work?**
Each task holds a lexicographic string position. Moving a task reads its two would-be neighbours and generates a key strictly between them, so exactly one row is written no matter where it lands. Dense integers would require rewriting every task after the insertion point, and would collide under concurrency.

**Q: Two users drag the same card at the same instant. What happens?**
Both requests open a transaction and take a `FOR UPDATE` lock on the board row. The second blocks until the first commits, then reads the *post-commit* neighbours and generates a fresh key. Last writer wins, and the board stays consistent. `@@unique([columnId, position])` is the backstop: if any bug ever produced a duplicate slot, the write fails instead of corrupting order silently.

**Q: Why lock the board and not the column?**
A cross-column move touches two columns, so a column lock would need two locks and could deadlock. One board-level lock is simpler and always correct. A board is a small contention unit — a handful of collaborators, not thousands. At real scale I'd move to per-column locks acquired in a deterministic id order, or reads at `SERIALIZABLE` with retry.

**Q: Can user A move a task into user B's board?**
No. I resolve the task up to its board, authorize against *that* board, then verify the target column belongs to the same board. `boardId` from the client is never trusted. There's an e2e test for exactly this.

**Q: Why 404 instead of 403 for a board you're not a member of?**
403 confirms the resource exists, which leaks information about other users' data. A non-member gets the same response as a nonexistent id.

**Q: What happens if the move request fails after the UI already moved the card?**
TanStack Query's `onMutate` snapshots the cache and applies the move optimistically; `onError` restores the snapshot and shows a toast; `onSettled` invalidates so the server stays the source of truth. I also cancel in-flight refetches in `onMutate` so a stale response can't overwrite the optimistic state.

**Q: Do the position strings grow forever?**
They grow by roughly one character each time you insert repeatedly into the same gap — the practical cost is negligible, and a background rebalance job can rewrite a column's keys to short values if it ever mattered. I noted it in "what I'd do next".

**Q: How would you add real-time collaboration?**
A WebSocket gateway with a room per board. After a successful move I'd broadcast the changed task to the room, and clients would patch their Query cache instead of refetching. The ordering model already supports it — concurrent moves converge because the server owns position generation.

**Q: Where do you store the token and why?**
[Your actual choice, plus the trade-off: httpOnly cookie resists XSS but needs CSRF handling; in-memory Bearer avoids CSRF but is lost on refresh, so I pair it with a refresh call on load.]

**Q: What's the weakest part of your submission?**
Have a real answer ready. "Board-level locking is coarser than necessary" or "no refresh-token rotation" is a strong answer. "Nothing" is a bad one.

---

## 13. Pitfalls that sink submissions

1. Not excluding the moved task from its neighbour list — same-column reorder silently does nothing.
2. Trusting `boardId` from the request body instead of resolving it from the resource.
3. Authorizing in the controller but mutating in a service that's also reachable from elsewhere.
4. Move logic outside a transaction — "usually fine" until the reviewer opens two tabs.
5. Returning `passwordHash` in any response.
6. Frontend computing positions and sending them. The server owns ordering.
7. `docker compose up` failing because the API starts before Postgres is ready, or migrations never run.
8. No seed data, so the reviewer opens an empty screen and has to build a board by hand to evaluate you.
9. Committing `.env`. Commit `.env.example` only.
10. Unstable list keys / index keys in React, causing card flicker during drag.
11. A README that only says "npm install && npm run dev".

---

## 14. Stretch goals, in priority order

1. e2e test for concurrent moves (spawn two parallel requests, assert both succeed and order is valid) — a genuinely impressive 30 lines
2. Live deployment link
3. WebSocket board updates
4. Activity log (`BoardActivity` table: who moved what, when)
5. Task assignees + due dates
6. GitHub Actions CI: lint, typecheck, test on push

Do #1 and #2 before any of the rest. A test that proves order consistency under concurrency is worth more than three extra features.
