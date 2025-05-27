const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcrypt");
const prisma = new PrismaClient();

const SALT_ROUNDS = 10;

// Format today's date for consistent date generation
const today = new Date();
const oneYearFromNow = new Date(today);
oneYearFromNow.setFullYear(today.getFullYear() + 1);

// Helper function to generate a date within the past 30 days
function recentDate() {
  const date = new Date(today);
  date.setDate(date.getDate() - Math.floor(Math.random() * 30));
  return date;
}

// Helper function to generate a date within the next 30 days
function futureDate() {
  const date = new Date(today);
  date.setDate(date.getDate() + Math.floor(Math.random() * 30));
  return date;
}

// Helper function to generate a future expiry date (between 1 and 12 months)
function expiryDate(months = 6) {
  const date = new Date(today);
  date.setMonth(date.getMonth() + months);
  return date;
}

async function main() {
  console.log("Starting seeding...");

  // Clean up existing data
  await prisma.$transaction([prisma.user.deleteMany()]);

  // Create Admin User
  console.log("Creating admin user...");
  const adminPassword = await bcrypt.hash("admin123", SALT_ROUNDS);
  const adminUser = await prisma.user.create({
    data: {
      name: "Admin User",
      email: "admin@SNF.com",
      password: adminPassword,
      role: "ADMIN",
      active: true,
      lastLogin: new Date(),
    },
  });

  console.log("Seeding completed successfully!");
}

// Execute the main function and handle any errors
main()
  .catch((e) => {
    console.error("Error seeding database:", e);
    process.exit(1);
  })
  .finally(async () => {
    // Close the Prisma client
    await prisma.$disconnect();
  });
