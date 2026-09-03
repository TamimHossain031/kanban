import { BoardRole, PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import { generateNKeysBetween } from 'fractional-indexing';

const prisma = new PrismaClient();

/**
 * Seed a populated, shared board so a reviewer sees a real Kanban on first
 * load and has two accounts to test sharing with.
 *
 *   ada@example.com   / password123   → OWNER
 *   grace@example.com / password123   → EDITOR (shared)
 */
async function main() {
  console.log('🌱  Seeding database…');

  const passwordHash = await argon2.hash('password123');

  // Idempotent: upsert users so re-seeding doesn't explode on unique email.
  const ada = await prisma.user.upsert({
    where: { email: 'ada@example.com' },
    update: {},
    create: { email: 'ada@example.com', name: 'Ada Lovelace', passwordHash },
  });

  const grace = await prisma.user.upsert({
    where: { email: 'grace@example.com' },
    update: {},
    create: { email: 'grace@example.com', name: 'Grace Hopper', passwordHash },
  });

  // Fresh board every seed run (keeps the demo deterministic).
  await prisma.board.deleteMany({ where: { title: 'Product Launch' } });

  const columnTitles = ['Backlog', 'In Progress', 'Review'];
  const columnPositions = generateNKeysBetween(null, null, columnTitles.length);

  const tasksByColumn: Record<string, { title: string; description?: string }[]> = {
    Backlog: [
      { title: 'Fix auth race condition', description: 'Two tabs, one move — verify the lock holds.' },
      { title: 'Write seed script', description: 'Two users, one shared board.' },
      { title: 'Design share dialog', description: 'Invite by email, pick a role.' },
    ],
    'In Progress': [
      { title: 'Build the move endpoint', description: 'TX + FOR UPDATE + fractional index.' },
      { title: 'Optimistic drag-and-drop', description: 'onMutate / onError rollback / onSettled.' },
    ],
    Review: [
      { title: 'Prisma schema + migration', description: 'Unique (columnId, position) backstop.' },
      { title: 'Access-control e2e tests', description: '404-not-403 for non-members.' },
      { title: 'README design decisions', description: 'The section that earns the interview.' },
    ],
  };

  const board = await prisma.board.create({
    data: {
      title: 'Product Launch',
      members: {
        create: [
          { userId: ada.id, role: BoardRole.OWNER },
          { userId: grace.id, role: BoardRole.EDITOR },
        ],
      },
    },
  });

  for (let i = 0; i < columnTitles.length; i++) {
    const title = columnTitles[i];
    const tasks = tasksByColumn[title];
    const taskPositions = generateNKeysBetween(null, null, tasks.length);

    await prisma.column.create({
      data: {
        boardId: board.id,
        title,
        position: columnPositions[i],
        tasks: {
          create: tasks.map((t, idx) => ({
            title: t.title,
            description: t.description ?? null,
            position: taskPositions[idx],
            createdById: ada.id,
          })),
        },
      },
    });
  }

  console.log('✅  Seed complete.');
  console.log('    Owner : ada@example.com   / password123');
  console.log('    Editor: grace@example.com / password123');
}

main()
  .catch((e) => {
    console.error('❌  Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
