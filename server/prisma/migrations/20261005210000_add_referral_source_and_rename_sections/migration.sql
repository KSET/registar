ALTER TABLE "Member"
ADD COLUMN "referralSource" TEXT;

UPDATE "Section"
SET "name" = 'Bike'
WHERE "name" IN ('Biciklistička', 'Biciklistice');

UPDATE "Section"
SET "name" = 'Pi'
WHERE "name" = 'Planinarska';

UPDATE "Section"
SET "name" = 'Comp'
WHERE "name" IN ('Računarska', 'Racunarska');

UPDATE "Section"
SET "name" = 'Tech'
WHERE "name" IN ('Tehnička', 'Tehnicka');
