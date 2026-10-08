UPDATE "Member"
SET "certificateValidUntil" = "certificateValidUntil" + 1
WHERE "certificateValidUntil" IS NOT NULL
  AND EXTRACT(MONTH FROM "certificateValidUntil") = 9
  AND EXTRACT(DAY FROM "certificateValidUntil") = 30;