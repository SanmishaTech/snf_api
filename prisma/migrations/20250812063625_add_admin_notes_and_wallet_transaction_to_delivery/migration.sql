/*
  Warnings:

  - A unique constraint covering the columns `[walletTransactionId]` on the table `delivery_schedule_entries` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE `delivery_schedule_entries` ADD COLUMN `adminNotes` TEXT NULL,
    ADD COLUMN `walletTransactionId` INTEGER NULL;

-- CreateIndex
CREATE UNIQUE INDEX `delivery_schedule_entries_walletTransactionId_key` ON `delivery_schedule_entries`(`walletTransactionId`);

-- CreateIndex
CREATE INDEX `delivery_schedule_entries_walletTransactionId_idx` ON `delivery_schedule_entries`(`walletTransactionId`);

-- AddForeignKey
ALTER TABLE `delivery_schedule_entries` ADD CONSTRAINT `delivery_schedule_entries_walletTransactionId_fkey` FOREIGN KEY (`walletTransactionId`) REFERENCES `wallet_transactions`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
