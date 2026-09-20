-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('M', 'Z');

-- CreateEnum
CREATE TYPE "MembershipLevel" AS ENUM ('PRIDRUZENO', 'PUNOPRAVNO', 'POCASNO', 'STARO');

-- CreateEnum
CREATE TYPE "DietType" AS ENUM ('MESOJED', 'VEGETARIJANSTVO', 'VEGANSTVO', 'SVEJED');

-- CreateEnum
CREATE TYPE "AppRole" AS ENUM ('CLAN', 'VODITELJ_SEKCIJE', 'ADMINISTRATOR');

-- CreateEnum
CREATE TYPE "PendingStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "FieldStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "Section" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Section_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Team" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Drink" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Drink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Allergy" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Allergy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Member" (
    "id" SERIAL NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "oib" VARCHAR(11) NOT NULL,
    "dateOfBirth" DATE NOT NULL,
    "address" TEXT NOT NULL,
    "gender" "Gender" NOT NULL,
    "facultyId" INTEGER,
    "facultyOther" TEXT,
    "phone" TEXT NOT NULL,
    "privateEmail" TEXT NOT NULL,
    "privateEmailVerified" BOOLEAN NOT NULL DEFAULT false,
    "ksetEmail" TEXT,
    "ksetEmailVerified" BOOLEAN NOT NULL DEFAULT true,
    "memberSince" DATE NOT NULL,
    "cardNumber" TEXT NOT NULL,
    "membershipLevel" "MembershipLevel" NOT NULL,
    "fullMemberSince" DATE,
    "dietType" "DietType" NOT NULL,
    "shirtSize" TEXT NOT NULL,
    "acceptedDocuments" BOOLEAN NOT NULL DEFAULT false,
    "certificatePath" TEXT,
    "certificateValidUntil" DATE,
    "appRole" "AppRole" NOT NULL DEFAULT 'CLAN',
    "homeSectionId" INTEGER NOT NULL,
    "managedSectionId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Member_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemberSection" (
    "id" SERIAL NOT NULL,
    "memberId" INTEGER NOT NULL,
    "sectionId" INTEGER NOT NULL,

    CONSTRAINT "MemberSection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemberTeam" (
    "id" SERIAL NOT NULL,
    "memberId" INTEGER NOT NULL,
    "teamId" INTEGER NOT NULL,

    CONSTRAINT "MemberTeam_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemberDrink" (
    "id" SERIAL NOT NULL,
    "memberId" INTEGER NOT NULL,
    "drinkId" INTEGER NOT NULL,

    CONSTRAINT "MemberDrink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemberAllergy" (
    "id" SERIAL NOT NULL,
    "memberId" INTEGER NOT NULL,
    "allergyId" INTEGER NOT NULL,

    CONSTRAINT "MemberAllergy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PendingMember" (
    "id" SERIAL NOT NULL,
    "googleEmail" TEXT NOT NULL,
    "fieldData" JSONB NOT NULL,
    "fieldStatus" JSONB NOT NULL,
    "status" "PendingStatus" NOT NULL DEFAULT 'PENDING',
    "homeSectionId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PendingMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PendingFieldChange" (
    "id" SERIAL NOT NULL,
    "memberId" INTEGER NOT NULL,
    "fieldName" TEXT NOT NULL,
    "newValue" TEXT NOT NULL,
    "status" "FieldStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedBy" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PendingFieldChange_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER,
    "action" TEXT NOT NULL,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Faculty" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Faculty_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Section_name_key" ON "Section"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Team_name_key" ON "Team"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Drink_name_key" ON "Drink"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Allergy_name_key" ON "Allergy"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Member_oib_key" ON "Member"("oib");

-- CreateIndex
CREATE UNIQUE INDEX "Member_ksetEmail_key" ON "Member"("ksetEmail");

-- CreateIndex
CREATE UNIQUE INDEX "Member_cardNumber_key" ON "Member"("cardNumber");

-- CreateIndex
CREATE UNIQUE INDEX "MemberSection_memberId_sectionId_key" ON "MemberSection"("memberId", "sectionId");

-- CreateIndex
CREATE UNIQUE INDEX "MemberTeam_memberId_teamId_key" ON "MemberTeam"("memberId", "teamId");

-- CreateIndex
CREATE UNIQUE INDEX "MemberDrink_memberId_drinkId_key" ON "MemberDrink"("memberId", "drinkId");

-- CreateIndex
CREATE UNIQUE INDEX "MemberAllergy_memberId_allergyId_key" ON "MemberAllergy"("memberId", "allergyId");

-- CreateIndex
CREATE UNIQUE INDEX "PendingMember_googleEmail_key" ON "PendingMember"("googleEmail");

-- CreateIndex
CREATE UNIQUE INDEX "Faculty_name_key" ON "Faculty"("name");

-- AddForeignKey
ALTER TABLE "Member" ADD CONSTRAINT "Member_facultyId_fkey" FOREIGN KEY ("facultyId") REFERENCES "Faculty"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Member" ADD CONSTRAINT "Member_homeSectionId_fkey" FOREIGN KEY ("homeSectionId") REFERENCES "Section"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Member" ADD CONSTRAINT "Member_managedSectionId_fkey" FOREIGN KEY ("managedSectionId") REFERENCES "Section"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberSection" ADD CONSTRAINT "MemberSection_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberSection" ADD CONSTRAINT "MemberSection_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "Section"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberTeam" ADD CONSTRAINT "MemberTeam_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberTeam" ADD CONSTRAINT "MemberTeam_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberDrink" ADD CONSTRAINT "MemberDrink_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberDrink" ADD CONSTRAINT "MemberDrink_drinkId_fkey" FOREIGN KEY ("drinkId") REFERENCES "Drink"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberAllergy" ADD CONSTRAINT "MemberAllergy_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberAllergy" ADD CONSTRAINT "MemberAllergy_allergyId_fkey" FOREIGN KEY ("allergyId") REFERENCES "Allergy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PendingMember" ADD CONSTRAINT "PendingMember_homeSectionId_fkey" FOREIGN KEY ("homeSectionId") REFERENCES "Section"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PendingFieldChange" ADD CONSTRAINT "PendingFieldChange_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PendingFieldChange" ADD CONSTRAINT "PendingFieldChange_reviewedBy_fkey" FOREIGN KEY ("reviewedBy") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;
