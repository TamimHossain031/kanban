import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import {
  auth,
  createTask,
  createTestApp,
  makeBoardWithColumn,
  registerUser,
  TestUser,
} from './helpers';

/**
 * Authorization is checked on the server, per resource, including nested
 * resources. These tests encode the rules a reviewer will probe.
 */
describe('Access control (e2e)', () => {
  let app: INestApplication;
  let owner: TestUser;
  let stranger: TestUser;

  beforeAll(async () => {
    ({ app } = await createTestApp());
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    owner = await registerUser(app);
    stranger = await registerUser(app);
  });

  it('returns 404 (not 403) when a non-member reads a board', async () => {
    const { boardId } = await makeBoardWithColumn(app, owner);
    await request(app.getHttpServer())
      .get(`/boards/${boardId}`)
      .set(auth(stranger.accessToken))
      .expect(404); // 403 would confirm the id is real
  });

  it('hides other users boards from the list', async () => {
    await makeBoardWithColumn(app, owner);
    const res = await request(app.getHttpServer())
      .get('/boards')
      .set(auth(stranger.accessToken))
      .expect(200);
    expect(res.body).toEqual([]);
  });

  it('rejects unauthenticated requests (401)', async () => {
    await request(app.getHttpServer()).get('/boards').expect(401);
  });

  it('never returns passwordHash', async () => {
    const res = await request(app.getHttpServer())
      .get('/auth/me')
      .set(auth(owner.accessToken))
      .expect(200);
    expect(res.body.passwordHash).toBeUndefined();
  });

  describe('roles', () => {
    it('lets a VIEWER read but not mutate', async () => {
      const { boardId, columnId } = await makeBoardWithColumn(app, owner);
      const viewer = await registerUser(app);
      await request(app.getHttpServer())
        .post(`/boards/${boardId}/members`)
        .set(auth(owner.accessToken))
        .send({ email: viewer.email, role: 'VIEWER' })
        .expect(201);

      // read: ok
      await request(app.getHttpServer())
        .get(`/boards/${boardId}`)
        .set(auth(viewer.accessToken))
        .expect(200);

      // mutate: forbidden
      await request(app.getHttpServer())
        .post(`/columns/${columnId}/tasks`)
        .set(auth(viewer.accessToken))
        .send({ title: 'nope' })
        .expect(403);
    });

    it('lets an EDITOR mutate but not share', async () => {
      const { boardId, columnId } = await makeBoardWithColumn(app, owner);
      const editor = await registerUser(app);
      await request(app.getHttpServer())
        .post(`/boards/${boardId}/members`)
        .set(auth(owner.accessToken))
        .send({ email: editor.email, role: 'EDITOR' })
        .expect(201);

      await request(app.getHttpServer())
        .post(`/columns/${columnId}/tasks`)
        .set(auth(editor.accessToken))
        .send({ title: 'editor task' })
        .expect(201);

      // sharing is owner-only
      const someone = await registerUser(app);
      await request(app.getHttpServer())
        .post(`/boards/${boardId}/members`)
        .set(auth(editor.accessToken))
        .send({ email: someone.email, role: 'VIEWER' })
        .expect(403);
    });

    it('only the owner can delete the board', async () => {
      const { boardId } = await makeBoardWithColumn(app, owner);
      const editor = await registerUser(app);
      await request(app.getHttpServer())
        .post(`/boards/${boardId}/members`)
        .set(auth(owner.accessToken))
        .send({ email: editor.email, role: 'EDITOR' })
        .expect(201);

      await request(app.getHttpServer())
        .delete(`/boards/${boardId}`)
        .set(auth(editor.accessToken))
        .expect(403);
      await request(app.getHttpServer())
        .delete(`/boards/${boardId}`)
        .set(auth(owner.accessToken))
        .expect(200);
    });
  });

  describe('sharing edge cases', () => {
    it('inviting an unregistered email → 404', async () => {
      const { boardId } = await makeBoardWithColumn(app, owner);
      await request(app.getHttpServer())
        .post(`/boards/${boardId}/members`)
        .set(auth(owner.accessToken))
        .send({ email: 'nobody@nowhere.local', role: 'VIEWER' })
        .expect(404);
    });

    it('inviting an existing member → 409', async () => {
      const { boardId } = await makeBoardWithColumn(app, owner);
      const member = await registerUser(app);
      const body = { email: member.email, role: 'VIEWER' };
      await request(app.getHttpServer())
        .post(`/boards/${boardId}/members`)
        .set(auth(owner.accessToken))
        .send(body)
        .expect(201);
      await request(app.getHttpServer())
        .post(`/boards/${boardId}/members`)
        .set(auth(owner.accessToken))
        .send(body)
        .expect(409);
    });

    it('owner removing themselves → 400', async () => {
      const { boardId } = await makeBoardWithColumn(app, owner);
      await request(app.getHttpServer())
        .delete(`/boards/${boardId}/members/${owner.id}`)
        .set(auth(owner.accessToken))
        .expect(400);
    });

    it('demoting the last owner → 400', async () => {
      const { boardId } = await makeBoardWithColumn(app, owner);
      await request(app.getHttpServer())
        .patch(`/boards/${boardId}/members/${owner.id}`)
        .set(auth(owner.accessToken))
        .send({ role: 'VIEWER' })
        .expect(400);
    });
  });

  it('resolves nested resources up to the board (task on a foreign board → 404)', async () => {
    const { columnId } = await makeBoardWithColumn(app, owner);
    const task = await createTask(app, owner, columnId, 'secret');

    // Stranger tries to edit a task they can't see. Resolved task→column→board,
    // membership missing → 404.
    await request(app.getHttpServer())
      .patch(`/tasks/${task.id}`)
      .set(auth(stranger.accessToken))
      .send({ title: 'hacked' })
      .expect(404);
  });
});
