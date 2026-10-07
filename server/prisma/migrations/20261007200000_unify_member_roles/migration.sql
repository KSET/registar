CREATE TYPE "AppRole_new" AS ENUM (
  'CLAN',
  'VODITELJ_SEKCIJE',
  'ADMINISTRATOR',
  'SANKER',
  'VODITELJ_PROGRAMA'
);

ALTER TABLE "Member" ALTER COLUMN "appRole" DROP DEFAULT;

ALTER TABLE "Member"
ALTER COLUMN "appRole" TYPE "AppRole_new"
USING (
  CASE
    WHEN "appRole" = 'CLAN' AND "functionalRole" = 'SANKER' THEN 'SANKER'
    WHEN "appRole" = 'CLAN' AND "functionalRole" = 'VODITELJ_PROGRAMA' THEN 'VODITELJ_PROGRAMA'
    ELSE "appRole"::text
  END
)::"AppRole_new";

ALTER TABLE "Member" DROP COLUMN "functionalRole";
DROP TYPE "MemberFunctionRole";
DROP TYPE "AppRole";
ALTER TYPE "AppRole_new" RENAME TO "AppRole";
ALTER TABLE "Member" ALTER COLUMN "appRole" SET DEFAULT 'CLAN';
