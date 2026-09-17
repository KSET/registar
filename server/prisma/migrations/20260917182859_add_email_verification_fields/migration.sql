-- AlterTable
ALTER TABLE "Member" ADD COLUMN     "associationEmailVerified" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "privateEmailVerified" BOOLEAN NOT NULL DEFAULT false,
ALTER COLUMN "associationEmail" DROP NOT NULL;
