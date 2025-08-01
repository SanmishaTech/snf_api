-- AlterTable
ALTER TABLE `depot_product_variants` ADD COLUMN `purchasePrice` DECIMAL(10, 2) NULL;

-- AlterTable
ALTER TABLE `subscriptions` ADD COLUMN `deliveryInstructions` TEXT NULL;
