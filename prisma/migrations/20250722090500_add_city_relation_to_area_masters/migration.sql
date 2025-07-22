-- AlterTable
ALTER TABLE `area_masters` ADD COLUMN `cityId` INTEGER NULL;

-- CreateIndex
CREATE INDEX `area_masters_cityId_idx` ON `area_masters`(`cityId`);

-- AddForeignKey
ALTER TABLE `area_masters` ADD CONSTRAINT `area_masters_cityId_fkey` FOREIGN KEY (`cityId`) REFERENCES `cities`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;