const { PrismaClient } = require('@prisma/client');
const dayjs = require('dayjs');
const prisma = new PrismaClient();

async function debugVipul() {
  const mobile = '7718912990';
  console.log('--- Debugging Vipul (7718912990) ---');
  
  const user = await prisma.user.findFirst({
    where: { mobile: mobile },
    include: {
        member: {
            include: {
                subscriptions: true
            }
        }
    }
  });

  if (!user) {
    console.log('User not found!');
    return;
  }

  console.log('User found:', user.name);
  console.log('Member ID:', user.member?.id);
  
  const yesterdayStart = dayjs().subtract(1, 'day').startOf('day').toDate();
  const yesterdayEnd = dayjs().startOf('day').toDate();
  console.log('Searching for subscriptions between:', yesterdayStart, 'and', yesterdayEnd);

  const lapsedSubs = user.member.subscriptions.filter(s => 
    s.expiryDate >= yesterdayStart && s.expiryDate < yesterdayEnd
  );

  console.log('Lapsed subscriptions (yesterday):', lapsedSubs.length);
  lapsedSubs.forEach(s => console.log(`- Sub ID: ${s.id}, Expiry: ${s.expiryDate}, Status: ${s.paymentStatus}`));

  const activeSubs = user.member.subscriptions.filter(s => 
    s.expiryDate >= dayjs().toDate() && s.paymentStatus === 'PAID'
  );
  console.log('Active/Future PAID subscriptions:', activeSubs.length);
  activeSubs.forEach(s => console.log(`- Sub ID: ${s.id}, Expiry: ${s.expiryDate}`));

  console.log('--- End Debug ---');
}

debugVipul().finally(() => prisma.$disconnect());
