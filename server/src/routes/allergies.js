const express = require('express');
const prisma = require('../lib/prisma');
const { authenticateToken } = require('../middleware/auth');
const { authorize } = require('../middleware/authorize');

const router = express.Router();

router.get('/', authenticateToken, async (req, res) => {
  try {
    const allergies = await prisma.allergy.findMany({
      orderBy: { name: 'asc' },
    });
    res.json(allergies);
  } catch (err) {
    console.error('Get allergies error:', err);
    res.status(500).json({ error: 'Greška na serveru.' });
  }
});

router.post('/', authenticateToken, authorize('ADMINISTRATOR'), async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Naziv alergije je obavezan.' });
    }
    const allergy = await prisma.allergy.create({
      data: { name: name.trim() },
    });
    res.status(201).json(allergy);
  } catch (err) {
    if (err.code === 'P2002') {
      return res.status(409).json({ error: 'Alergija s tim nazivom već postoji.' });
    }
    console.error('Create allergy error:', err);
    res.status(500).json({ error: 'Greška na serveru.' });
  }
});

module.exports = router;
