# API Reference

Base URL: `http://localhost:4000`
Interactive docs (Swagger): `http://localhost:4000/api/docs`

Auth: send `Authorization: Bearer <accessToken>` on every route except the
`@Public()` ones below. A global `JwtAuthGuard` protects everything by default.

All ids are UUIDs. All list/tree responses are ordered by `position` ascending.

## Auth

| Method | Path | Access | Body | Notes |
|---|---|---|---|---|
| POST | `/auth/register` | public | `{ email, name, password }` | returns `{ user, accessToken, refreshToken }` |
| POST | `/auth/login` | public | `{ email, password }` | returns tokens + user |
| POST | `/auth/refresh` | public | `{ refreshToken }` | rotates the access token |
| GET | `/auth/me` | any | — | hydrate the client |

Passwords are hashed with **argon2**. `passwordHash` is never returned.
Auth routes are rate-limited to 5 requests/min.

## Boards

| Method | Path | Role | Notes |
|---|---|---|---|
| GET | `/boards` | member | boards the caller can see (membership-filtered) |
| POST | `/boards` | any | `{ title }` — creator gets `OWNER` membership |
| GET | `/boards/:id` | member | **full tree**: columns + tasks + members, one request; includes `myRole` |
| PATCH | `/boards/:id` | owner | `{ title }` |
| DELETE | `/boards/:id` | owner | cascades columns + tasks + members |

## Sharing (owner only)

| Method | Path | Body | Errors |
|---|---|---|---|
| GET | `/boards/:boardId/members` | — | |
| POST | `/boards/:boardId/members` | `{ email, role }` | 404 unregistered email · 409 already a member · 400 role=OWNER |
| PATCH | `/boards/:boardId/members/:userId` | `{ role }` | 400 demoting the last owner |
| DELETE | `/boards/:boardId/members/:userId` | — | 400 owner removing themselves · 400 removing last owner |

## Columns

| Method | Path | Role | Body |
|---|---|---|---|
| POST | `/boards/:boardId/columns` | editor | `{ title }` — appends to the end |
| PATCH | `/columns/:id` | editor | `{ title }` |
| DELETE | `/columns/:id` | editor | — (cascades tasks) |
| PATCH | `/columns/:id/move` | editor | `{ targetIndex }` |

## Tasks

| Method | Path | Role | Body |
|---|---|---|---|
| POST | `/columns/:columnId/tasks` | editor | `{ title, description? }` — appends to the end |
| PATCH | `/tasks/:id` | editor | `{ title?, description? }` (`description: null` clears) |
| DELETE | `/tasks/:id` | editor | — |
| **PATCH** | **`/tasks/:id/move`** | editor | `{ targetColumnId, targetIndex }` |

### Why `move` is its own endpoint

Moving has different validation, locking, and permission semantics than editing a
title, so it's a dedicated `PATCH …/move` rather than a generic task update. The
client sends an **index**; the server generates the fractional position. See
[architecture.md](./architecture.md).

## Error shape

Errors are normalized (a Prisma exception filter maps `P2002 → 409`,
`P2025 → 404`):

```json
{ "statusCode": 409, "message": "User is already a member of this board", "error": "CONFLICT" }
```

Validation failures (`class-validator`) return `400` with a `message` array.
Unknown body properties are rejected (`whitelist` + `forbidNonWhitelisted`).
