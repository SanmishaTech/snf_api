-- CreateTable
CREATE TABLE `users` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `password` VARCHAR(191) NOT NULL,
    `role` ENUM('ADMIN', 'AGENCY', 'MEMBER', 'VENDOR', 'DepotAdmin') NOT NULL,
    `mobile` VARCHAR(191) NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `lastLogin` DATETIME(3) NULL,
    `resetToken` VARCHAR(191) NULL,
    `resetTokenExpires` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `depotId` INTEGER NULL,
    `joiningDate` DATETIME(3) NULL,

    UNIQUE INDEX `users_email_key`(`email`),
    UNIQUE INDEX `users_mobile_key`(`mobile`),
    INDEX `users_depotId_fkey`(`depotId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `vendors` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(191) NOT NULL,
    `contact_person_name` VARCHAR(191) NULL,
    `address1` VARCHAR(191) NOT NULL,
    `address2` VARCHAR(191) NULL,
    `city` VARCHAR(191) NOT NULL,
    `pincode` INTEGER NOT NULL,
    `mobile` VARCHAR(191) NOT NULL,
    `alternate_mobile` VARCHAR(191) NULL,
    `email` VARCHAR(191) NULL,
    `userId` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `isDairySupplier` BOOLEAN NOT NULL DEFAULT false,

    UNIQUE INDEX `vendors_email_key`(`email`),
    UNIQUE INDEX `vendors_userId_key`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `agencies` (
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

    UNIQUE INDEX `agencies_email_key`(`email`),
    UNIQUE INDEX `agencies_userId_key`(`userId`),
    UNIQUE INDEX `agencies_depotId_key`(`depotId`),
    INDEX `agencies_depotId_idx`(`depotId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `products` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(191) NOT NULL,
    `url` VARCHAR(191) NULL,
    `attachmentUrl` VARCHAR(191) NULL,
    `price` DOUBLE NOT NULL,
    `rate` DOUBLE NOT NULL,
    `deliveredQuantity` INTEGER NULL,
    `description` TEXT NULL,
    `unit` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `categoryId` INTEGER NULL,
    `isDairyProduct` BOOLEAN NOT NULL DEFAULT false,
    `maintainStock` BOOLEAN NOT NULL DEFAULT false,

    INDEX `products_categoryId_fkey`(`categoryId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ProductVariant` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `productId` INTEGER NOT NULL,
    `hsnCode` VARCHAR(191) NULL,
    `mrp` DECIMAL(10, 2) NOT NULL,
    `sellingPrice` DECIMAL(10, 2) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `purchasePrice` DECIMAL(10, 2) NOT NULL,
    `gstRate` DECIMAL(5, 2) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `ProductVariant_productId_idx`(`productId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `categories` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(191) NOT NULL,
    `isDairy` BOOLEAN NOT NULL DEFAULT false,
    `imageUrl` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `categories_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `cities` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `cities_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `locations` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(191) NOT NULL,
    `cityId` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `agencyId` INTEGER NULL,

    INDEX `locations_agencyId_idx`(`agencyId`),
    INDEX `locations_cityId_fkey`(`cityId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `vendor_orders` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `poNumber` VARCHAR(191) NULL,
    `orderDate` DATETIME(3) NOT NULL,
    `deliveryDate` DATETIME(3) NULL,
    `vendorId` INTEGER NOT NULL,
    `contactPersonName` VARCHAR(191) NULL,
    `notes` VARCHAR(191) NULL,
    `status` ENUM('PENDING', 'DELIVERED', 'RECEIVED') NOT NULL DEFAULT 'PENDING',
    `deliveredById` INTEGER NULL,
    `deliveredAt` DATETIME(3) NULL,
    `receivedById` INTEGER NULL,
    `receivedAt` DATETIME(3) NULL,
    `totalAmount` DOUBLE NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `vendor_orders_deliveredById_fkey`(`deliveredById`),
    INDEX `vendor_orders_receivedById_fkey`(`receivedById`),
    INDEX `vendor_orders_vendorId_fkey`(`vendorId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `vendor_order_items` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `vendorOrderId` INTEGER NOT NULL,
    `productId` INTEGER NOT NULL,
    `quantity` INTEGER NOT NULL,
    `priceAtPurchase` DOUBLE NOT NULL,
    `agencyId` INTEGER NOT NULL,
    `deliveredQuantity` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `receivedQuantity` INTEGER NULL,
    `depotId` INTEGER NULL,
    `depotVariantId` INTEGER NULL,

    INDEX `vendor_order_items_agencyId_fkey`(`agencyId`),
    INDEX `vendor_order_items_productId_fkey`(`productId`),
    INDEX `vendor_order_items_vendorOrderId_fkey`(`vendorOrderId`),
    INDEX `vendor_order_items_depotId_fkey`(`depotId`),
    INDEX `vendor_order_items_depotVariantId_fkey`(`depotVariantId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `members` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(191) NOT NULL,
    `userId` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `walletBalance` DOUBLE NOT NULL DEFAULT 0,

    UNIQUE INDEX `members_userId_key`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Banner` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `caption` VARCHAR(191) NULL,
    `description` VARCHAR(191) NULL,
    `imagePath` VARCHAR(191) NOT NULL,
    `listOrder` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `depots` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(191) NOT NULL,
    `address` VARCHAR(191) NOT NULL,
    `contactPerson` VARCHAR(191) NULL,
    `contactNumber` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `isOnline` BOOLEAN NOT NULL DEFAULT false,

    UNIQUE INDEX `depots_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `delivery_addresses` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `memberId` INTEGER NOT NULL,
    `recipientName` VARCHAR(191) NOT NULL,
    `mobile` VARCHAR(191) NOT NULL,
    `plotBuilding` VARCHAR(191) NOT NULL,
    `streetArea` VARCHAR(191) NOT NULL,
    `landmark` VARCHAR(191) NULL,
    `pincode` VARCHAR(191) NOT NULL,
    `city` VARCHAR(191) NOT NULL,
    `state` VARCHAR(191) NOT NULL,
    `label` VARCHAR(191) NULL,
    `isDefault` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `locationId` INTEGER NULL,

    INDEX `delivery_addresses_memberId_fkey`(`memberId`),
    INDEX `delivery_addresses_locationId_idx`(`locationId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `area_masters` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(191) NOT NULL,
    `pincodes` LONGTEXT NOT NULL,
    `deliveryType` ENUM('HandDelivery', 'Courier') NOT NULL,
    `depotId` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `area_masters_depotId_idx`(`depotId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `delivery_schedule_entries` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `subscriptionId` INTEGER NOT NULL,
    `memberId` INTEGER NOT NULL,
    `deliveryAddressId` INTEGER NULL,
    `productId` INTEGER NOT NULL,
    `deliveryDate` DATE NOT NULL,
    `quantity` INTEGER NOT NULL DEFAULT 1,
    `status` ENUM('PENDING', 'DELIVERED', 'NOT_DELIVERED', 'CANCELLED', 'SKIPPED') NOT NULL DEFAULT 'PENDING',
    `agentId` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `depotId` INTEGER NULL,
    `depotProductVariantId` INTEGER NULL,

    INDEX `delivery_schedule_entries_subscriptionId_idx`(`subscriptionId`),
    INDEX `delivery_schedule_entries_memberId_idx`(`memberId`),
    INDEX `delivery_schedule_entries_deliveryAddressId_idx`(`deliveryAddressId`),
    INDEX `delivery_schedule_entries_productId_idx`(`productId`),
    INDEX `delivery_schedule_entries_deliveryDate_idx`(`deliveryDate`),
    INDEX `delivery_schedule_entries_agentId_idx`(`agentId`),
    INDEX `delivery_schedule_entries_depotId_fkey`(`depotId`),
    INDEX `delivery_schedule_entries_depotProductVariantId_fkey`(`depotProductVariantId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `subscriptions` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `memberId` INTEGER NOT NULL,
    `deliveryAddressId` INTEGER NULL,
    `productId` INTEGER NOT NULL,
    `startDate` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `period` INTEGER NOT NULL,
    `expiryDate` DATETIME(3) NOT NULL,
    `deliverySchedule` ENUM('DAILY', 'DAY1_DAY2', 'WEEKDAYS', 'ALTERNATE_DAYS') NOT NULL,
    `weekdays` VARCHAR(191) NULL,
    `qty` INTEGER NOT NULL,
    `altQty` INTEGER NULL,
    `rate` DOUBLE NOT NULL,
    `totalQty` INTEGER NOT NULL,
    `amount` DOUBLE NOT NULL,
    `paymentMode` ENUM('ONLINE', 'CASH', 'UPI', 'BANK') NULL,
    `paymentReferenceNo` VARCHAR(191) NULL,
    `paymentDate` DATETIME(3) NULL,
    `paymentStatus` ENUM('PENDING', 'PAID', 'FAILED') NOT NULL DEFAULT 'PENDING',
    `agencyId` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `payableamt` DOUBLE NOT NULL DEFAULT 0,
    `receivedamt` DOUBLE NOT NULL DEFAULT 0,
    `walletamt` DOUBLE NOT NULL DEFAULT 0,
    `depotProductVariantId` INTEGER NULL,
    `productOrderId` INTEGER NULL,

    INDEX `subscriptions_memberId_idx`(`memberId`),
    INDEX `subscriptions_deliveryAddressId_idx`(`deliveryAddressId`),
    INDEX `subscriptions_productId_idx`(`productId`),
    INDEX `subscriptions_agencyId_idx`(`agencyId`),
    INDEX `subscriptions_depotProductVariantId_fkey`(`depotProductVariantId`),
    INDEX `subscriptions_productOrderId_fkey`(`productOrderId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `wallet_transactions` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `memberId` INTEGER NOT NULL,
    `amount` DOUBLE NOT NULL,
    `status` ENUM('PENDING', 'PAID', 'FAILED') NOT NULL DEFAULT 'PENDING',
    `type` ENUM('CREDIT', 'DEBIT') NOT NULL,
    `paymentMethod` VARCHAR(191) NULL,
    `referenceNumber` VARCHAR(191) NULL,
    `notes` TEXT NULL,
    `processedByAdminId` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `wallet_transactions_memberId_idx`(`memberId`),
    INDEX `wallet_transactions_processedByAdminId_idx`(`processedByAdminId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `VariantStock` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `productId` INTEGER NOT NULL,
    `variantId` INTEGER NOT NULL,
    `depotId` INTEGER NOT NULL,
    `closingQty` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `productVariantId` INTEGER NULL,

    INDEX `VariantStock_productId_idx`(`productId`),
    INDEX `VariantStock_variantId_idx`(`variantId`),
    INDEX `VariantStock_depotId_idx`(`depotId`),
    INDEX `VariantStock_productVariantId_fkey`(`productVariantId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Purchase` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `purchaseNo` VARCHAR(191) NOT NULL,
    `purchaseDate` DATE NOT NULL,
    `invoiceNo` VARCHAR(191) NULL,
    `invoiceDate` DATE NULL,
    `vendorId` INTEGER NOT NULL,
    `depotId` INTEGER NULL,
    `createdById` INTEGER NULL,
    `updatedById` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `paidAmt` DOUBLE NOT NULL DEFAULT 0,

    UNIQUE INDEX `Purchase_purchaseNo_key`(`purchaseNo`),
    INDEX `Purchase_vendorId_idx`(`vendorId`),
    INDEX `Purchase_depotId_idx`(`depotId`),
    INDEX `Purchase_createdById_fkey`(`createdById`),
    INDEX `Purchase_updatedById_fkey`(`updatedById`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PurchaseDetail` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `purchaseId` INTEGER NOT NULL,
    `productId` INTEGER NOT NULL,
    `variantId` INTEGER NOT NULL,
    `quantity` INTEGER NOT NULL,
    `purchaseRate` DECIMAL(10, 2) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `productVariantId` INTEGER NULL,

    INDEX `PurchaseDetail_purchaseId_idx`(`purchaseId`),
    INDEX `PurchaseDetail_productId_idx`(`productId`),
    INDEX `PurchaseDetail_variantId_idx`(`variantId`),
    INDEX `PurchaseDetail_productVariantId_fkey`(`productVariantId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `purchase_payments` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `paymentno` VARCHAR(191) NULL,
    `paymentDate` DATE NOT NULL,
    `vendorId` INTEGER NOT NULL,
    `mode` VARCHAR(191) NOT NULL,
    `referenceNo` VARCHAR(191) NULL,
    `notes` TEXT NULL,
    `totalAmount` DECIMAL(10, 2) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `purchaseId` INTEGER NULL,

    UNIQUE INDEX `purchase_payments_paymentno_key`(`paymentno`),
    INDEX `purchase_payments_vendorId_idx`(`vendorId`),
    INDEX `purchase_payments_purchaseId_fkey`(`purchaseId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `purchase_payment_details` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `purchasePaymentId` INTEGER NOT NULL,
    `purchaseId` INTEGER NOT NULL,
    `amount` DECIMAL(10, 2) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `purchase_payment_details_purchasePaymentId_idx`(`purchasePaymentId`),
    INDEX `purchase_payment_details_purchaseId_idx`(`purchaseId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `wastages` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `wastageNo` VARCHAR(191) NOT NULL,
    `wastageDate` DATETIME(3) NOT NULL,
    `invoiceNo` VARCHAR(191) NULL,
    `invoiceDate` DATE NULL,
    `vendorId` INTEGER NULL,
    `depotId` INTEGER NULL,
    `createdById` INTEGER NULL,
    `updatedById` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `wastages_wastageNo_key`(`wastageNo`),
    INDEX `wastages_vendorId_idx`(`vendorId`),
    INDEX `wastages_depotId_idx`(`depotId`),
    INDEX `wastages_createdById_fkey`(`createdById`),
    INDEX `wastages_updatedById_fkey`(`updatedById`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `wastage_details` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `wastageId` INTEGER NOT NULL,
    `productId` INTEGER NOT NULL,
    `variantId` INTEGER NOT NULL,
    `quantity` INTEGER NOT NULL,

    INDEX `wastage_details_variantId_idx`(`variantId`),
    INDEX `wastage_details_productId_fkey`(`productId`),
    INDEX `wastage_details_wastageId_fkey`(`wastageId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `depot_product_variants` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `depotId` INTEGER NOT NULL,
    `productId` INTEGER NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `hsnCode` VARCHAR(191) NULL,
    `minimumQty` INTEGER NOT NULL DEFAULT 0,
    `closingQty` INTEGER NOT NULL DEFAULT 0,
    `notInStock` BOOLEAN NOT NULL DEFAULT false,
    `isHidden` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `buyOncePrice` DECIMAL(10, 2) NULL,
    `price15Day` DECIMAL(10, 2) NULL,
    `price1Month` DECIMAL(10, 2) NULL,
    `price3Day` DECIMAL(10, 2) NULL,
    `price7Day` DECIMAL(10, 2) NULL,
    `mrp` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,

    INDEX `depot_product_variants_productId_idx`(`productId`),
    INDEX `depot_product_variants_depotId_idx`(`depotId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `StockLedger` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `productId` INTEGER NOT NULL,
    `variantId` INTEGER NOT NULL,
    `depotId` INTEGER NOT NULL,
    `transactionDate` DATE NOT NULL,
    `receivedQty` INTEGER NOT NULL DEFAULT 0,
    `issuedQty` INTEGER NOT NULL DEFAULT 0,
    `module` VARCHAR(191) NOT NULL,
    `foreignKey` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `productVariantId` INTEGER NULL,

    INDEX `StockLedger_productId_idx`(`productId`),
    INDEX `StockLedger_variantId_idx`(`variantId`),
    INDEX `StockLedger_depotId_idx`(`depotId`),
    INDEX `StockLedger_productVariantId_fkey`(`productVariantId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `transfers` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `transferNo` VARCHAR(191) NOT NULL,
    `transferDate` DATE NOT NULL,
    `fromDepotId` INTEGER NOT NULL,
    `toDepotId` INTEGER NOT NULL,
    `notes` TEXT NULL,
    `createdById` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `transfers_transferNo_key`(`transferNo`),
    INDEX `transfers_fromDepotId_idx`(`fromDepotId`),
    INDEX `transfers_toDepotId_idx`(`toDepotId`),
    INDEX `transfers_createdById_idx`(`createdById`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `transfer_details` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `transferId` INTEGER NOT NULL,
    `fromDepotVariantId` INTEGER NOT NULL,
    `toDepotVariantId` INTEGER NOT NULL,
    `quantity` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `transfer_details_transferId_idx`(`transferId`),
    INDEX `transfer_details_fromDepotVariantId_idx`(`fromDepotVariantId`),
    INDEX `transfer_details_toDepotVariantId_idx`(`toDepotVariantId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `product_orders` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `orderNo` VARCHAR(191) NOT NULL,
    `memberId` INTEGER NOT NULL,
    `totalQty` INTEGER NOT NULL,
    `totalAmount` DOUBLE NOT NULL,
    `walletamt` DOUBLE NOT NULL DEFAULT 0,
    `payableamt` DOUBLE NOT NULL DEFAULT 0,
    `receivedamt` DOUBLE NOT NULL DEFAULT 0,
    `paymentMode` ENUM('ONLINE', 'CASH', 'UPI', 'BANK') NULL,
    `paymentReferenceNo` VARCHAR(191) NULL,
    `paymentDate` DATETIME(3) NULL,
    `paymentStatus` ENUM('PENDING', 'PAID', 'FAILED') NOT NULL DEFAULT 'PENDING',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `agencyId` INTEGER NULL,
    `invoiceNo` VARCHAR(191) NULL,
    `invoicePath` VARCHAR(191) NULL,

    UNIQUE INDEX `product_orders_orderNo_key`(`orderNo`),
    UNIQUE INDEX `product_orders_invoiceNo_key`(`invoiceNo`),
    INDEX `product_orders_memberId_idx`(`memberId`),
    INDEX `product_orders_agencyId_idx`(`agencyId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `users` ADD CONSTRAINT `users_depotId_fkey` FOREIGN KEY (`depotId`) REFERENCES `depots`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `vendors` ADD CONSTRAINT `vendors_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `agencies` ADD CONSTRAINT `agencies_depotId_fkey` FOREIGN KEY (`depotId`) REFERENCES `depots`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `agencies` ADD CONSTRAINT `agencies_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `products` ADD CONSTRAINT `products_categoryId_fkey` FOREIGN KEY (`categoryId`) REFERENCES `categories`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProductVariant` ADD CONSTRAINT `ProductVariant_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `products`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `locations` ADD CONSTRAINT `locations_agencyId_fkey` FOREIGN KEY (`agencyId`) REFERENCES `agencies`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `locations` ADD CONSTRAINT `locations_cityId_fkey` FOREIGN KEY (`cityId`) REFERENCES `cities`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `vendor_orders` ADD CONSTRAINT `vendor_orders_deliveredById_fkey` FOREIGN KEY (`deliveredById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `vendor_orders` ADD CONSTRAINT `vendor_orders_receivedById_fkey` FOREIGN KEY (`receivedById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `vendor_orders` ADD CONSTRAINT `vendor_orders_vendorId_fkey` FOREIGN KEY (`vendorId`) REFERENCES `vendors`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `vendor_order_items` ADD CONSTRAINT `vendor_order_items_agencyId_fkey` FOREIGN KEY (`agencyId`) REFERENCES `agencies`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `vendor_order_items` ADD CONSTRAINT `vendor_order_items_depotId_fkey` FOREIGN KEY (`depotId`) REFERENCES `depots`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `vendor_order_items` ADD CONSTRAINT `vendor_order_items_depotVariantId_fkey` FOREIGN KEY (`depotVariantId`) REFERENCES `depot_product_variants`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `vendor_order_items` ADD CONSTRAINT `vendor_order_items_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `products`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `vendor_order_items` ADD CONSTRAINT `vendor_order_items_vendorOrderId_fkey` FOREIGN KEY (`vendorOrderId`) REFERENCES `vendor_orders`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `members` ADD CONSTRAINT `members_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `delivery_addresses` ADD CONSTRAINT `delivery_addresses_locationId_fkey` FOREIGN KEY (`locationId`) REFERENCES `locations`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `delivery_addresses` ADD CONSTRAINT `delivery_addresses_memberId_fkey` FOREIGN KEY (`memberId`) REFERENCES `members`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `area_masters` ADD CONSTRAINT `area_masters_depotId_fkey` FOREIGN KEY (`depotId`) REFERENCES `depots`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `delivery_schedule_entries` ADD CONSTRAINT `delivery_schedule_entries_agentId_fkey` FOREIGN KEY (`agentId`) REFERENCES `agencies`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `delivery_schedule_entries` ADD CONSTRAINT `delivery_schedule_entries_deliveryAddressId_fkey` FOREIGN KEY (`deliveryAddressId`) REFERENCES `delivery_addresses`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `delivery_schedule_entries` ADD CONSTRAINT `delivery_schedule_entries_depotId_fkey` FOREIGN KEY (`depotId`) REFERENCES `depots`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `delivery_schedule_entries` ADD CONSTRAINT `delivery_schedule_entries_depotProductVariantId_fkey` FOREIGN KEY (`depotProductVariantId`) REFERENCES `depot_product_variants`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `delivery_schedule_entries` ADD CONSTRAINT `delivery_schedule_entries_memberId_fkey` FOREIGN KEY (`memberId`) REFERENCES `members`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `delivery_schedule_entries` ADD CONSTRAINT `delivery_schedule_entries_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `products`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `delivery_schedule_entries` ADD CONSTRAINT `delivery_schedule_entries_subscriptionId_fkey` FOREIGN KEY (`subscriptionId`) REFERENCES `subscriptions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `subscriptions` ADD CONSTRAINT `subscriptions_agencyId_fkey` FOREIGN KEY (`agencyId`) REFERENCES `agencies`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `subscriptions` ADD CONSTRAINT `subscriptions_deliveryAddressId_fkey` FOREIGN KEY (`deliveryAddressId`) REFERENCES `delivery_addresses`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `subscriptions` ADD CONSTRAINT `subscriptions_depotProductVariantId_fkey` FOREIGN KEY (`depotProductVariantId`) REFERENCES `depot_product_variants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `subscriptions` ADD CONSTRAINT `subscriptions_memberId_fkey` FOREIGN KEY (`memberId`) REFERENCES `members`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `subscriptions` ADD CONSTRAINT `subscriptions_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `products`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `subscriptions` ADD CONSTRAINT `subscriptions_productOrderId_fkey` FOREIGN KEY (`productOrderId`) REFERENCES `product_orders`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `wallet_transactions` ADD CONSTRAINT `wallet_transactions_memberId_fkey` FOREIGN KEY (`memberId`) REFERENCES `members`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `wallet_transactions` ADD CONSTRAINT `wallet_transactions_processedByAdminId_fkey` FOREIGN KEY (`processedByAdminId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `VariantStock` ADD CONSTRAINT `VariantStock_depotId_fkey` FOREIGN KEY (`depotId`) REFERENCES `depots`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `VariantStock` ADD CONSTRAINT `VariantStock_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `products`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `VariantStock` ADD CONSTRAINT `VariantStock_productVariantId_fkey` FOREIGN KEY (`productVariantId`) REFERENCES `ProductVariant`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `VariantStock` ADD CONSTRAINT `VariantStock_variantId_fkey` FOREIGN KEY (`variantId`) REFERENCES `depot_product_variants`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Purchase` ADD CONSTRAINT `Purchase_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Purchase` ADD CONSTRAINT `Purchase_depotId_fkey` FOREIGN KEY (`depotId`) REFERENCES `depots`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Purchase` ADD CONSTRAINT `Purchase_updatedById_fkey` FOREIGN KEY (`updatedById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Purchase` ADD CONSTRAINT `Purchase_vendorId_fkey` FOREIGN KEY (`vendorId`) REFERENCES `vendors`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PurchaseDetail` ADD CONSTRAINT `PurchaseDetail_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `products`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PurchaseDetail` ADD CONSTRAINT `PurchaseDetail_productVariantId_fkey` FOREIGN KEY (`productVariantId`) REFERENCES `ProductVariant`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PurchaseDetail` ADD CONSTRAINT `PurchaseDetail_purchaseId_fkey` FOREIGN KEY (`purchaseId`) REFERENCES `Purchase`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PurchaseDetail` ADD CONSTRAINT `PurchaseDetail_variantId_fkey` FOREIGN KEY (`variantId`) REFERENCES `depot_product_variants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `purchase_payments` ADD CONSTRAINT `purchase_payments_purchaseId_fkey` FOREIGN KEY (`purchaseId`) REFERENCES `Purchase`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `purchase_payments` ADD CONSTRAINT `purchase_payments_vendorId_fkey` FOREIGN KEY (`vendorId`) REFERENCES `vendors`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `purchase_payment_details` ADD CONSTRAINT `purchase_payment_details_purchaseId_fkey` FOREIGN KEY (`purchaseId`) REFERENCES `Purchase`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `purchase_payment_details` ADD CONSTRAINT `purchase_payment_details_purchasePaymentId_fkey` FOREIGN KEY (`purchasePaymentId`) REFERENCES `purchase_payments`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `wastages` ADD CONSTRAINT `wastages_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `wastages` ADD CONSTRAINT `wastages_depotId_fkey` FOREIGN KEY (`depotId`) REFERENCES `depots`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `wastages` ADD CONSTRAINT `wastages_updatedById_fkey` FOREIGN KEY (`updatedById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `wastages` ADD CONSTRAINT `wastages_vendorId_fkey` FOREIGN KEY (`vendorId`) REFERENCES `vendors`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `wastage_details` ADD CONSTRAINT `wastage_details_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `products`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `wastage_details` ADD CONSTRAINT `wastage_details_variantId_fkey` FOREIGN KEY (`variantId`) REFERENCES `depot_product_variants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `wastage_details` ADD CONSTRAINT `wastage_details_wastageId_fkey` FOREIGN KEY (`wastageId`) REFERENCES `wastages`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `depot_product_variants` ADD CONSTRAINT `depot_product_variants_depotId_fkey` FOREIGN KEY (`depotId`) REFERENCES `depots`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `depot_product_variants` ADD CONSTRAINT `depot_product_variants_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `products`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StockLedger` ADD CONSTRAINT `StockLedger_depotId_fkey` FOREIGN KEY (`depotId`) REFERENCES `depots`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StockLedger` ADD CONSTRAINT `StockLedger_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `products`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StockLedger` ADD CONSTRAINT `StockLedger_productVariantId_fkey` FOREIGN KEY (`productVariantId`) REFERENCES `ProductVariant`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StockLedger` ADD CONSTRAINT `StockLedger_variantId_fkey` FOREIGN KEY (`variantId`) REFERENCES `depot_product_variants`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `transfers` ADD CONSTRAINT `transfers_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `transfers` ADD CONSTRAINT `transfers_fromDepotId_fkey` FOREIGN KEY (`fromDepotId`) REFERENCES `depots`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `transfers` ADD CONSTRAINT `transfers_toDepotId_fkey` FOREIGN KEY (`toDepotId`) REFERENCES `depots`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `transfer_details` ADD CONSTRAINT `transfer_details_fromDepotVariantId_fkey` FOREIGN KEY (`fromDepotVariantId`) REFERENCES `depot_product_variants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `transfer_details` ADD CONSTRAINT `transfer_details_toDepotVariantId_fkey` FOREIGN KEY (`toDepotVariantId`) REFERENCES `depot_product_variants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `transfer_details` ADD CONSTRAINT `transfer_details_transferId_fkey` FOREIGN KEY (`transferId`) REFERENCES `transfers`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `product_orders` ADD CONSTRAINT `product_orders_agencyId_fkey` FOREIGN KEY (`agencyId`) REFERENCES `agencies`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `product_orders` ADD CONSTRAINT `product_orders_memberId_fkey` FOREIGN KEY (`memberId`) REFERENCES `members`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
