const { checkAndSendLapsedSubscriptionReminders } = require('../services/cronService');
require('dotenv').config();

console.log('Manually triggering lapsed subscription reminder check...');

checkAndSendLapsedSubscriptionReminders()
  .then(() => {
    console.log('Manual check completed successfully.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Manual check failed:', error);
    process.exit(1);
  });
