-- AlterTable
ALTER TABLE `subscriptions` MODIFY `startDate` DATE NOT NULL,
    MODIFY `expiryDate` DATE NOT NULL;

-- AlterTable
ALTER TABLE `users` MODIFY `role` ENUM('ADMIN', 'AGENCY', 'MEMBER', 'VENDOR', 'DepotAdmin', 'SUPERVISOR') NOT NULL;

-- AlterTable
ALTER TABLE `vendor_order_items` ADD COLUMN `supervisorQuantity` INTEGER NULL;

-- CreateTable
CREATE TABLE `supervisors` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(191) NOT NULL,
    `contact_person_name` VARCHAR(191) NULL,
    `mobile` VARCHAR(191) NOT NULL,
    `address1` VARCHAR(191) NOT NULL,
    `address2` VARCHAR(191) NULL,
    `city` VARCHAR(191) NOT NULL,
    `pincode` INTEGER NOT NULL,
    `alternate_mobile` VARCHAR(191) NULL,
    `email` VARCHAR(191) NULL,
    `userId` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `depotId` INTEGER NULL,
    `agencyId` INTEGER NULL,

    UNIQUE INDEX `supervisors_email_key`(`email`),
    UNIQUE INDEX `supervisors_userId_key`(`userId`),
    INDEX `supervisors_depotId_idx`(`depotId`),
    INDEX `supervisors_agencyId_idx`(`agencyId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `leads` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(191) NOT NULL,
    `mobile` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NULL,
    `plotBuilding` VARCHAR(191) NOT NULL,
    `streetArea` VARCHAR(191) NOT NULL,
    `landmark` VARCHAR(191) NULL,
    `pincode` VARCHAR(191) NOT NULL,
    `city` VARCHAR(191) NOT NULL,
    `state` VARCHAR(191) NOT NULL,
    `productId` INTEGER NULL,
    `isDairyProduct` BOOLEAN NOT NULL DEFAULT false,
    `notes` TEXT NULL,
    `status` ENUM('NEW', 'CONTACTED', 'CONVERTED', 'CLOSED') NOT NULL DEFAULT 'NEW',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `leads_status_idx`(`status`),
    INDEX `leads_isDairyProduct_idx`(`isDairyProduct`),
    INDEX `leads_pincode_idx`(`pincode`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `supervisors` ADD CONSTRAINT `supervisors_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `supervisors` ADD CONSTRAINT `supervisors_depotId_fkey` FOREIGN KEY (`depotId`) REFERENCES `depots`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `supervisors` ADD CONSTRAINT `supervisors_agencyId_fkey` FOREIGN KEY (`agencyId`) REFERENCES `agencies`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
