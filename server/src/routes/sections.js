const express = require('express');
const prisma = require('../lib/prisma');
const { authenticateToken } = require('../middleware/auth');
const { authorize } = require('../middleware/authorize');

const router = express.Router();

router.get('/', authenticateToken, async (req, res) => {
  try {
    const sections = await prisma.section.findMany({
      orderBy: { name: 'asc' },
    });
    res.json(sections);
  } catch (err) {
    console.error('Get sections error:', err);
    res.status(500).json({ error: 'Greška na serveru.' });
  }
});

router.post('/', authenticateToken, authorize('ADMINISTRATOR'), async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Naziv sekcije je obavezan.' });
    }
    const section = await prisma.section.create({
      data: { name: name.trim() },
    });
    res.status(201).json(section);
  } catch (err) {
    if (err.code === 'P2002') {
      return res.status(409).json({ error: 'Sekcija s tim nazivom već postoji.' });
    }
    console.error('Create section error:', err);
    res.status(500).json({ error: 'Greška na serveru.' });
  }
});

module.exports = router;
