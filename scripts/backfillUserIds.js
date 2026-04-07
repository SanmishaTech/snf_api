const prisma = require("../src/config/db");

async function backfill() {
  console.log("Starting UserUniqueId Backfill...");

  // 1. Fetch all members
  const members = await prisma.user.findMany({
    where: {
      role: 'MEMBER'
    },
    orderBy: {
      createdAt: 'asc'
    }
  });

  console.log(`Found ${members.length} members to process.`);

  // 2. Clear existing unique IDs for members to ensure a perfect re-sync
  // (We do this because existing IDs are out of order relative to createdAt)
  console.log("Resetting existing unique IDs for members...");
  await prisma.user.updateMany({
    where: { role: 'MEMBER' },
    data: { userUniqueId: null }
  });

  const nextSeqs = {}; // Cache for sequences per year

  for (const user of members) {
    const year = new Date(user.createdAt).getFullYear();

    if (!nextSeqs[year]) {
      nextSeqs[year] = 1; // Starting from 0001 for each year
    }

    const generatedId = `${year}-${String(nextSeqs[year]).padStart(4, '0')}`;

    await prisma.user.update({
      where: { id: user.id },
      data: { userUniqueId: generatedId }
    });

    console.log(`Updated User ID ${user.id} (${user.name}): ${generatedId}`);
    nextSeqs[year]++;
  }

  console.log("Backfill complete!");
}

backfill()
  .catch((err) => {
    console.error("Error during backfill:", err);
  })
  .finally(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
