const { checkAndSendSubscriptionReminders } = require('./src/services/cronService');

async function runNow() {
  console.log('Manual trigger: Running subscription renewal reminders...');
  await checkAndSendSubscriptionReminders();
  console.log('Manual trigger: Finished.');
  process.exit(0);
}

runNow().catch(err => {
  console.error('Manual trigger: Failed:', err);
  process.exit(1);
});
