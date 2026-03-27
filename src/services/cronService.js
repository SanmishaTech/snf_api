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

/**
 * Core logic to check for subscriptions that expired yesterday and send renewal pending reminders.
 */
const checkAndSendLapsedSubscriptionReminders = async () => {
  console.log('[Lapsed Reminders] Started check');
  try {
    // Yesterday's range
    const yesterdayStart = dayjs().subtract(1, 'day').startOf('day').toDate();
    const yesterdayEnd = dayjs().startOf('day').toDate();

    let skip = 0;
    const take = 500;
    let hasMore = true;
    let totalProcessed = 0;

    const { sendSubscriptionRenewalPendingWhatsAppMessage } = require('./whatsAppService');

    while (hasMore) {
      const subscriptions = await prisma.subscription.findMany({
        where: {
          expiryDate: {
            gte: yesterdayStart,
            lt: yesterdayEnd,
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
        orderBy: { id: 'asc' }
      });

      if (subscriptions.length === 0) {
        hasMore = false;
        break;
      }

      for (const sub of subscriptions) {
        // Send reminder for every subscription that expired yesterday
        if (sub.member && sub.member.user && sub.member.user.mobile) {
          await sendSubscriptionRenewalPendingWhatsAppMessage(sub.member.user);
        }
      }

      totalProcessed += subscriptions.length;
      skip += take;
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    console.log(`[Lapsed Reminders] Completed check. Processed ${totalProcessed} subscriptions.`);
  } catch (error) {
    console.error('[Lapsed Reminders] Error running check:', error);
  }
};

/**
 * Core logic to check for subscriptions expiring tomorrow and send final renewal reminders.
 */
const checkAndSendFinalSubscriptionReminders = async () => {
  console.log('[Final Reminders] Started check');
  try {
    // Tomorrow's range
    const tomorrowStart = dayjs().add(1, 'day').startOf('day').toDate();
    const tomorrowEnd = dayjs().add(2, 'day').startOf('day').toDate();

    let skip = 0;
    const take = 500;
    let hasMore = true;
    let totalProcessed = 0;

    const { sendSubscriptionRenewalFinalWhatsAppMessage } = require('./whatsAppService');

    while (hasMore) {
      const subscriptions = await prisma.subscription.findMany({
        where: {
          expiryDate: {
            gte: tomorrowStart,
            lt: tomorrowEnd,
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
        orderBy: { id: 'asc' }
      });

      if (subscriptions.length === 0) {
        hasMore = false;
        break;
      }

      for (const sub of subscriptions) {
        if (sub.member && sub.member.user && sub.member.user.mobile) {
          await sendSubscriptionRenewalFinalWhatsAppMessage(sub.member.user);
        }
      }

      totalProcessed += subscriptions.length;
      skip += take;
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    console.log(`[Final Reminders] Completed check. Processed ${totalProcessed} subscriptions.`);
  } catch (error) {
    console.error('[Final Reminders] Error running check:', error);
  }
};

const initCronJobs = () => {
  // Run every day at 1:00 AM
  cron.schedule('0 1 * * *', async () => {
    // 1. Regular 3-day reminders
    await checkAndSendSubscriptionReminders();
    // 2. Final 1-day reminders (ends tomorrow)
    await checkAndSendFinalSubscriptionReminders();
    // 3. Lapsed 1-day reminders (ended yesterday)
    await checkAndSendLapsedSubscriptionReminders();
  }, {
    timezone: "Asia/Kolkata"
  });
};

module.exports = { 
  initCronJobs,
  checkAndSendSubscriptionReminders,
  checkAndSendLapsedSubscriptionReminders,
  checkAndSendFinalSubscriptionReminders
};
