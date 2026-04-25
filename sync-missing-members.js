const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('Starting sync for missing members...');

  // 1. Fetch all users with role 'MEMBER'
  const users = await prisma.user.findMany({
    where: { role: 'MEMBER' },
    include: { member: true },
  });

  console.log(`Found ${users.length} users with role 'MEMBER'.`);

  let addedCount = 0;

  for (const user of users) {
    // 2. Check if member record is absent
    if (!user.member) {
      try {
        await prisma.member.create({
          data: {
            userId: user.id,
            name: user.name,
            walletBalance: 0,
          },
        });
        console.log(`Created member record for user: ${user.name} (ID: ${user.id})`);
        addedCount++;
      } catch (err) {
        console.error(`Failed to create member for user ${user.name} (ID: ${user.id}):`, err.message);
      }
    }
  }

  console.log(`\nSync complete!`);
  console.log(`Added ${addedCount} missing member records.`);
}

main()
  .catch((e) => {
    console.error('An error occurred during sync:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
