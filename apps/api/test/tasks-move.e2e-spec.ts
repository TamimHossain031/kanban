import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  auth,
  createTask,
  createTestApp,
  makeBoardWithColumn,
  orderedTaskTitles,
  registerUser,
  TestUser,
} from './helpers';

/**
 * The file they open first. Proves the ordering algorithm is correct across
 * every move shape, survives concurrency, and refuses cross-board moves.
 */
describe('Task move (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let owner: TestUser;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    owner = await registerUser(app);
  });

  const move = (user: TestUser, taskId: string, body: any) =>
    request(app.getHttpServer())
      .patch(`/tasks/${taskId}/move`)
      .set(auth(user.accessToken))
      .send(body);

  it('reorders within the same column: dragging the first task to the end', async () => {
    const { boardId, columnId } = await makeBoardWithColumn(app, owner);
    const a = await createTask(app, owner, columnId, 'A');
    await createTask(app, owner, columnId, 'B');
    await createTask(app, owner, columnId, 'C');

    // Move A to index 2 (the end).
    await move(owner, a.id, { targetColumnId: columnId, targetIndex: 2 }).expect(200);

    expect(await orderedTaskTitles(app, owner, boardId, columnId)).toEqual(['B', 'C', 'A']);
  });

  it('reorders within the same column: dragging a task down one slot actually moves it', async () => {
    // The classic bug: forgetting to exclude the moved task no-ops this.
    const { boardId, columnId } = await makeBoardWithColumn(app, owner);
    const a = await createTask(app, owner, columnId, 'A');
    await createTask(app, owner, columnId, 'B');
    await createTask(app, owner, columnId, 'C');

    await move(owner, a.id, { targetColumnId: columnId, targetIndex: 1 }).expect(200);

    expect(await orderedTaskTitles(app, owner, boardId, columnId)).toEqual(['B', 'A', 'C']);
  });

  it('moves a task to another column at a specific index', async () => {
    const { boardId, columnId } = await makeBoardWithColumn(app, owner);
    const second = await request(app.getHttpServer())
      .post(`/boards/${boardId}/columns`)
      .set(auth(owner.accessToken))
      .send({ title: 'Doing' })
      .expect(201);

    const t1 = await createTask(app, owner, columnId, 'T1');
    await createTask(app, owner, second.body.id, 'X');
    await createTask(app, owner, second.body.id, 'Y');

    // Move T1 into the middle of the second column.
    await move(owner, t1.id, { targetColumnId: second.body.id, targetIndex: 1 }).expect(200);

    expect(await orderedTaskTitles(app, owner, boardId, columnId)).toEqual([]);
    expect(await orderedTaskTitles(app, owner, boardId, second.body.id)).toEqual([
      'X',
      'T1',
      'Y',
    ]);
  });

  it('clamps an out-of-range index to the end instead of crashing', async () => {
    const { boardId, columnId } = await makeBoardWithColumn(app, owner);
    await createTask(app, owner, columnId, 'A');
    const b = await createTask(app, owner, columnId, 'B');

    await move(owner, b.id, { targetColumnId: columnId, targetIndex: 9999 }).expect(200);

    expect(await orderedTaskTitles(app, owner, boardId, columnId)).toEqual(['A', 'B']);
  });

  it('rejects moving a task into a column on another board (403)', async () => {
    const mine = await makeBoardWithColumn(app, owner);
    const task = await createTask(app, owner, mine.columnId, 'A');

    // A different owner + board the mover shouldn't be able to reach.
    const other = await registerUser(app);
    const theirs = await makeBoardWithColumn(app, other);

    await move(owner, task.id, {
      targetColumnId: theirs.columnId,
      targetIndex: 0,
    }).expect(403);
  });

  it('forbids a VIEWER from moving tasks (403)', async () => {
    const { boardId, columnId } = await makeBoardWithColumn(app, owner);
    const task = await createTask(app, owner, columnId, 'A');

    const viewer = await registerUser(app);
    await request(app.getHttpServer())
      .post(`/boards/${boardId}/members`)
      .set(auth(owner.accessToken))
      .send({ email: viewer.email, role: 'VIEWER' })
      .expect(201);

    await move(viewer, task.id, { targetColumnId: columnId, targetIndex: 0 }).expect(403);
  });

  it('keeps order consistent under two concurrent moves (stretch)', async () => {
    const { boardId, columnId } = await makeBoardWithColumn(app, owner);
    const a = await createTask(app, owner, columnId, 'A');
    const b = await createTask(app, owner, columnId, 'B');
    await createTask(app, owner, columnId, 'C');

    // Fire two moves at the same instant into the same gap. The board-level
    // FOR UPDATE lock serializes them; both succeed, no unique-constraint blow-up.
    const [r1, r2] = await Promise.all([
      move(owner, a.id, { targetColumnId: columnId, targetIndex: 2 }),
      move(owner, b.id, { targetColumnId: columnId, targetIndex: 2 }),
    ]);
    expect([r1.status, r2.status]).toEqual([200, 200]);

    // Positions remain unique and ordered.
    const tasks = await prisma.task.findMany({
      where: { columnId },
      orderBy: { position: 'asc' },
      select: { position: true },
    });
    const positions = tasks.map((t) => t.position);
    expect(new Set(positions).size).toBe(positions.length);
    expect([...positions].sort()).toEqual(positions);
  });
});
