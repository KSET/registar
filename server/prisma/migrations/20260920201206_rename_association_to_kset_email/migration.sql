/*
  Warnings:

  - You are about to drop the column `associationEmail` on the `Member` table. All the data in the column will be lost.
  - You are about to drop the column `associationEmailVerified` on the `Member` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[ksetEmail]` on the table `Member` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "Member_associationEmail_key";

-- AlterTable
ALTER TABLE "Member" DROP COLUMN "associationEmail",
DROP COLUMN "associationEmailVerified",
ADD COLUMN     "ksetEmail" TEXT,
ADD COLUMN     "ksetEmailVerified" BOOLEAN NOT NULL DEFAULT true;

-- CreateIndex
CREATE UNIQUE INDEX "Member_ksetEmail_key" ON "Member"("ksetEmail");
