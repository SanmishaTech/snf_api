const app = require('./src/app');
const { initCronJobs } = require('./src/services/cronService');

const port = process.env.PORT || 3000;

// Initialize Cron Jobs
initCronJobs();

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
