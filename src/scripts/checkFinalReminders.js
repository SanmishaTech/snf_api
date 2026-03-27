const { checkAndSendFinalSubscriptionReminders } = require('../services/cronService');
require('dotenv').config();

console.log('Manually triggering final subscription reminder check (Expiring Tomorrow)...');

checkAndSendFinalSubscriptionReminders()
  .then(() => {
    console.log('Manual check completed successfully.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Manual check failed:', error);
    process.exit(1);
  });
