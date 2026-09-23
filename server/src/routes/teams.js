const express = require('express');
const prisma = require('../lib/prisma');
const { authenticateToken } = require('../middleware/auth');
const { authorize } = require('../middleware/authorize');

const router = express.Router();

router.get('/', authenticateToken, async (req, res) => {
  try {
    const teams = await prisma.team.findMany({
      orderBy: { name: 'asc' },
    });
    res.json(teams);
  } catch (err) {
    console.error('Get teams error:', err);
    res.status(500).json({ error: 'Greška na serveru.' });
  }
});

router.post('/', authenticateToken, authorize('ADMINISTRATOR'), async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Naziv tima je obavezan.' });
    }
    const team = await prisma.team.create({
      data: { name: name.trim() },
    });
    res.status(201).json(team);
  } catch (err) {
    if (err.code === 'P2002') {
      return res.status(409).json({ error: 'Tim s tim nazivom već postoji.' });
    }
    console.error('Create team error:', err);
    res.status(500).json({ error: 'Greška na serveru.' });
  }
});

module.exports = router;
