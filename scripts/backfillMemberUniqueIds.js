const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const pad4 = (n) => String(n).padStart(4, '0');

const parseSeq = (userUniqueId) => {
  if (!userUniqueId) return 0;
  const parts = String(userUniqueId).split('-');
  const seqPart = parts[1] || '0';
  const seq = parseInt(seqPart, 10);
  return Number.isFinite(seq) ? seq : 0;
};

const getMaxSeqForYear = async (year) => {
  const prefix = `${year}-`;
  const lastUserThisYear = await prisma.user.findFirst({
    where: {
      role: 'MEMBER',
      userUniqueId: {
        startsWith: prefix,
      },
    },
    select: { userUniqueId: true },
    orderBy: { userUniqueId: 'desc' },
  });

  return parseSeq(lastUserThisYear?.userUniqueId);
};

const backfill = async () => {
  const dryRun = String(process.env.DRY_RUN || '').toLowerCase() === '1' ||
    String(process.env.DRY_RUN || '').toLowerCase() === 'true';

  const users = await prisma.user.findMany({
    where: {
      role: 'MEMBER',
      OR: [{ userUniqueId: null }, { userUniqueId: '' }],
    },
    select: {
      id: true,
      createdAt: true,
      userUniqueId: true,
    },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });

  console.log(`Found ${users.length} MEMBER users without userUniqueId`);
  if (users.length === 0) return;

  const nextSeqByYear = new Map();

  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const u of users) {
    const year = new Date(u.createdAt).getFullYear();

    if (!nextSeqByYear.has(year)) {
      const maxSeq = await getMaxSeqForYear(year);
      nextSeqByYear.set(year, maxSeq + 1);
    }

    const nextSeq = nextSeqByYear.get(year);
    const generatedUserUniqueId = `${year}-${pad4(nextSeq)}`;

    // reserve the sequence for the next user
    nextSeqByYear.set(year, nextSeq + 1);

    if (dryRun) {
      console.log(`[DRY_RUN] userId=${u.id} createdAt=${u.createdAt.toISOString()} -> ${generatedUserUniqueId}`);
      skipped++;
      continue;
    }

    let success = false;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await prisma.user.update({
          where: { id: u.id },
          data: { userUniqueId: generatedUserUniqueId },
        });
        success = true;
        break;
      } catch (e) {
        // Prisma unique constraint violation
        if (e && e.code === 'P2002') {
          const retryId = `${year}-${pad4(nextSeqByYear.get(year))}`;
          nextSeqByYear.set(year, nextSeqByYear.get(year) + 1);
          console.warn(`Unique collision for ${generatedUserUniqueId}. Retrying with ${retryId} (userId=${u.id})`);
          continue;
        }
        throw e;
      }
    }

    if (success) {
      updated++;
      if (updated % 50 === 0) {
        console.log(`Progress: updated ${updated}/${users.length}`);
      }
    } else {
      failed++;
      console.error(`Failed to assign userUniqueId for userId=${u.id}`);
    }
  }

  console.log(`Done. updated=${updated}, dryRunSkipped=${skipped}, failed=${failed}`);
};

backfill()
  .catch((err) => {
    console.error('Backfill failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });



  // $env:DRY_RUN="true"; node scripts/backfillMemberUniqueIds.js
// Remove-Item Env:DRY_RUN -ErrorAction SilentlyContinue; node scripts/backfillMemberUniqueIds.js