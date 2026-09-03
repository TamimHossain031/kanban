import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaExceptionFilter } from '../src/common/filters/prisma-exception.filter';
import { PrismaService } from '../src/prisma/prisma.service';

// Rate limiting is out of scope for functional tests (many rapid registers).
process.env.THROTTLE_DISABLED = 'true';

export async function createTestApp(): Promise<{
  app: INestApplication;
  prisma: PrismaService;
}> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleRef.createNestApplication();

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.useGlobalFilters(new PrismaExceptionFilter());

  await app.init();
  const prisma = app.get(PrismaService);
  return { app, prisma };
}

let counter = 0;
export function uniqueEmail(prefix = 'user') {
  counter += 1;
  const rand = Math.random().toString(36).slice(2, 10);
  return `${prefix}-${Date.now()}-${counter}-${rand}@test.local`;
}

export interface TestUser {
  id: string;
  email: string;
  accessToken: string;
}

export async function registerUser(
  app: INestApplication,
  email = uniqueEmail(),
): Promise<TestUser> {
  const res = await request(app.getHttpServer())
    .post('/auth/register')
    .send({ email, name: email.split('@')[0], password: 'password123' })
    .expect(201);
  return { id: res.body.user.id, email, accessToken: res.body.accessToken };
}

export function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

/** Convenience: build a board with one column, owned by `user`. */
export async function makeBoardWithColumn(app: INestApplication, user: TestUser) {
  const boardRes = await request(app.getHttpServer())
    .post('/boards')
    .set(auth(user.accessToken))
    .send({ title: 'Test Board' })
    .expect(201);
  const boardId = boardRes.body.id;

  const colRes = await request(app.getHttpServer())
    .post(`/boards/${boardId}/columns`)
    .set(auth(user.accessToken))
    .send({ title: 'Todo' })
    .expect(201);

  return { boardId, columnId: colRes.body.id };
}

export async function createTask(
  app: INestApplication,
  user: TestUser,
  columnId: string,
  title: string,
) {
  const res = await request(app.getHttpServer())
    .post(`/columns/${columnId}/tasks`)
    .set(auth(user.accessToken))
    .send({ title })
    .expect(201);
  return res.body;
}

/** Read the ordered task ids in a column from the board tree. */
export async function orderedTaskTitles(
  app: INestApplication,
  user: TestUser,
  boardId: string,
  columnId: string,
): Promise<string[]> {
  const res = await request(app.getHttpServer())
    .get(`/boards/${boardId}`)
    .set(auth(user.accessToken))
    .expect(200);
  const column = res.body.columns.find((c: any) => c.id === columnId);
  return column.tasks.map((t: any) => t.title);
}
