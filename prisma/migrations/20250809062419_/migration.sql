-- AlterTable
ALTER TABLE `snf_orders` ADD COLUMN `depotId` INTEGER NULL,
    ADD COLUMN `invoiceNo` VARCHAR(191) NULL,
    ADD COLUMN `invoicePath` VARCHAR(191) NULL;

-- CreateIndex
CREATE INDEX `snf_orders_depotId_idx` ON `snf_orders`(`depotId`);

-- AddForeignKey
ALTER TABLE `snf_orders` ADD CONSTRAINT `snf_orders_depotId_fkey` FOREIGN KEY (`depotId`) REFERENCES `depots`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
