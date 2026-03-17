-- CreateTable
CREATE TABLE `audit_logs` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `userId` INTEGER NULL,
    `userName` VARCHAR(191) NULL,
    `userRole` VARCHAR(191) NULL,
    `category` VARCHAR(191) NOT NULL,
    `action` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `resource` VARCHAR(191) NULL,
    `resourceId` VARCHAR(191) NULL,
    `pagePath` VARCHAR(191) NULL,
    `method` VARCHAR(191) NULL,
    `requestPath` VARCHAR(191) NULL,
    `statusCode` INTEGER NULL,
    `ipAddress` VARCHAR(191) NULL,
    `userAgent` VARCHAR(191) NULL,
    `metadata` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `audit_logs_userId_idx`(`userId`),
    INDEX `audit_logs_userRole_idx`(`userRole`),
    INDEX `audit_logs_category_idx`(`category`),
    INDEX `audit_logs_action_idx`(`action`),
    INDEX `audit_logs_createdAt_idx`(`createdAt`),
    INDEX `audit_logs_pagePath_idx`(`pagePath`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `audit_logs`
    ADD CONSTRAINT `audit_logs_userId_fkey`
    FOREIGN KEY (`userId`) REFERENCES `users`(`id`)
    ON DELETE SET NULL
    ON UPDATE CASCADE;
