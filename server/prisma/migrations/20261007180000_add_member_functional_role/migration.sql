CREATE TYPE "MemberFunctionRole" AS ENUM ('SANKER', 'VODITELJ_PROGRAMA');

ALTER TABLE "Member"
ADD COLUMN "functionalRole" "MemberFunctionRole";
