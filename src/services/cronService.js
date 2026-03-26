const cron = require('node-cron');
const { PrismaClient } = require('@prisma/client');
const dayjs = require('dayjs');
const { sendSubscriptionRenewalWhatsAppMessage } = require('./whatsAppService');

const prisma = new PrismaClient();

/**
 * Core logic to check for subscriptions expiring in 3 days and send WhatsApp reminders.
 * This is extracted from the cron job to allow manual execution.
 */
const checkAndSendSubscriptionReminders = async () => {
  console.log('[Subscription Reminders] Started check');
  try {
    // We want subscriptions expiring exactly 3 days from today
    const targetDate = dayjs().add(3, 'day').startOf('day').toDate();
    const nextDate = dayjs().add(4, 'day').startOf('day').toDate();

    let skip = 0;
    const take = 500; // Process 500 at a time
    let hasMore = true;
    let totalProcessed = 0;

    while (hasMore) {
      const subscriptions = await prisma.subscription.findMany({
        where: {
          expiryDate: {
            gte: targetDate,
            lt: nextDate,
          }
        },
        include: {
          member: {
            include: {
              user: true
            }
          }
        },
        skip: skip,
        take: take,
        orderBy: {
          id: 'asc'
        }
      });

      if (subscriptions.length === 0) {
        hasMore = false;
        break;
      }

      for (const sub of subscriptions) {
        if (sub.member && sub.member.user && sub.member.user.mobile) {
          await sendSubscriptionRenewalWhatsAppMessage(sub.member.user, sub);
        }
      }

      totalProcessed += subscriptions.length;
      skip += take;

      // Yield the event loop to prevent blocking API requests during heavy processing
      await new Promise(resolve => setTimeout(resolve, 100)); // 100ms pause
    }

    console.log(`[Subscription Reminders] Completed check. Processed ${totalProcessed} subscriptions.`);
  } catch (error) {
    console.error('[Subscription Reminders] Error running check:', error);
  }
};

const initCronJobs = () => {
  // Run every day at 1:00 AM
  cron.schedule('0 1 * * *', async () => {
    await checkAndSendSubscriptionReminders();
  }, {
    timezone: "Asia/Kolkata" // Assuming Indian Standard Time based on server locale
  });
};

module.exports = { 
  initCronJobs,
  checkAndSendSubscriptionReminders
};
