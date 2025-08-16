/*
  Warnings:

  - The values [DELIVER_TO_AGENT] on the enum `delivery_schedule_entries_status` will be removed. If these variants are still used in the database, this will fail.
  - Added the required column `city` to the `depots` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `delivery_schedule_entries` MODIFY `status` ENUM('PENDING', 'DELIVERED', 'NOT_DELIVERED', 'CANCELLED', 'SKIPPED', 'SKIP_BY_CUSTOMER', 'INDRAAI_DELIVERY', 'TRANSFER_TO_AGENT') NOT NULL DEFAULT 'PENDING';

-- AlterTable
ALTER TABLE `depots` ADD COLUMN `city` VARCHAR(191) NOT NULL;
