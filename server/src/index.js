const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');
const passport = require('./passport');
const config = require('./config');
const authRoutes = require('./routes/auth');
const sectionRoutes = require('./routes/sections');
const teamRoutes = require('./routes/teams');
const drinkRoutes = require('./routes/drinks');
const allergyRoutes = require('./routes/allergies');
const pendingRoutes = require('./routes/pending');
const memberRoutes = require('./routes/members');
const fieldChangeRoutes = require('./routes/fieldChanges');
const facultyRoutes = require('./routes/faculties');
const uploadRoutes = require('./routes/uploads');
const importRoutes = require('./routes/importRoutes');
const honoraryMemberRoutes = require('./routes/honoraryMembers');

const app = express();

// Behind Traefik in production, requests arrive from the proxy's own IP
// unless Express is told to trust its X-Forwarded-* headers - without this,
// express-rate-limit below either rate-limits everyone as one IP or refuses
// to start (it validates trust-proxy vs X-Forwarded-For on boot).
if (config.isProduction) {
  app.set('trust proxy', 1);
}

app.use(helmet());
app.use(cors({
  origin: config.clientUrl,
  credentials: true,
}));
app.use(express.json());
app.use(passport.initialize());

// Routes
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Tighter limit on auth/OAuth endpoints - the main target for account-ID
// enumeration or brute-forcing link attempts.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/auth', authLimiter);

// Looser general limit on the rest of the API.
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api', apiLimiter);

app.use('/api/auth', authRoutes);
app.use('/api/sections', sectionRoutes);
app.use('/api/teams', teamRoutes);
app.use('/api/drinks', drinkRoutes);
app.use('/api/allergies', allergyRoutes);
app.use('/api/pending', pendingRoutes);
app.use('/api/members', memberRoutes);
app.use('/api/field-changes', fieldChangeRoutes);
app.use('/api/faculties', facultyRoutes);
app.use('/api/uploads', uploadRoutes);
app.use('/api/import', importRoutes);
app.use('/api/honorary-members', honoraryMemberRoutes);

// Serves the built React app if present (the production image copies
// client/dist in at build time; local dev runs the client separately via
// its own Vite dev server, so this folder won't exist there and the block
// is skipped entirely). Any non-API path falls through to index.html so
// React Router's client-side routes work on a hard refresh/direct link.
const clientDistPath = path.join(__dirname, '../../client/dist');
if (fs.existsSync(clientDistPath)) {
  app.use(express.static(clientDistPath));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(clientDistPath, 'index.html'));
  });
}

app.listen(config.port, () => {
  console.log(`Server running on port ${config.port}`);
});
