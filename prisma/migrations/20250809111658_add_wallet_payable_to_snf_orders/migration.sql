-- AlterTable
ALTER TABLE `snf_orders` ADD COLUMN `payableAmount` DOUBLE NOT NULL DEFAULT 0,
    ADD COLUMN `walletamt` DOUBLE NOT NULL DEFAULT 0;
