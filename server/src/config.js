require('dotenv').config();

const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret || jwtSecret == 'change_me_in_production' || jwtSecret.length < 32) {
  console.error(
    'FATAL: JWT_SECRET nije postavljen ili je preslab.'
  );
  process.exit(1);
}

module.exports = {
  port: process.env.SERVER_PORT || 4000,
  serverUrl: process.env.SERVER_URL || 'http://localhost:4000',
  clientUrl: process.env.CLIENT_URL || 'http://localhost:3000',
  databaseUrl: process.env.DATABASE_URL,
  jwtSecret: process.env.JWT_SECRET,
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  },
};
