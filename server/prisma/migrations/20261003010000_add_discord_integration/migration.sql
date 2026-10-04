CREATE TYPE "DiscordVerificationStatus" AS ENUM ('PENDING', 'PROCESSING', 'SUCCESS', 'FAILED', 'EXPIRED');

ALTER TABLE "Member"
ADD COLUMN "discordId" VARCHAR(20);

CREATE UNIQUE INDEX "Member_discordId_key" ON "Member"("discordId");

CREATE TABLE "DiscordVerification" (
    "state" VARCHAR(64) NOT NULL,
    "discordId" VARCHAR(20) NOT NULL,
    "status" "DiscordVerificationStatus" NOT NULL DEFAULT 'PENDING',
    "memberId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "DiscordVerification_pkey" PRIMARY KEY ("state"),
    CONSTRAINT "DiscordVerification_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "DiscordVerification_discordId_createdAt_idx" ON "DiscordVerification"("discordId", "createdAt");
CREATE INDEX "DiscordVerification_createdAt_idx" ON "DiscordVerification"("createdAt");
