const express = require('express');
const cors = require('cors');
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

const app = express();

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

app.use('/api/auth', authRoutes);
app.use('/api/sections', sectionRoutes);
app.use('/api/teams', teamRoutes);
app.use('/api/drinks', drinkRoutes);
app.use('/api/allergies', allergyRoutes);
app.use('/api/pending', pendingRoutes);
app.use('/api/members', memberRoutes);
app.use('/api/field-changes', fieldChangeRoutes);
app.use('/api/faculties', facultyRoutes);

app.listen(config.port, () => {
  console.log(`Server running on port ${config.port}`);
});
