#!/bin/sh
# Seeds lookup data (sections/teams/drinks/allergies) and the placeholder
# admin user. Safe to re-run - uses upsert, so it won't duplicate existing
# rows. Only needed once per fresh database, or after seed.js itself changes.
docker compose exec server sh -c "cd server && npx prisma db seed"
