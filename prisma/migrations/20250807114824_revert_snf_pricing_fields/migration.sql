/*
  Warnings:

  - You are about to drop the column `snfMrp` on the `depot_product_variants` table. All the data in the column will be lost.
  - You are about to drop the column `snfPurchasePrice` on the `depot_product_variants` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE `depot_product_variants` DROP COLUMN `snfMrp`,
    DROP COLUMN `snfPurchasePrice`;
