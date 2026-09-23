const express = require('express');
const prisma = require('../lib/prisma');
const { authenticateToken } = require('../middleware/auth');
const { authorize } = require('../middleware/authorize');

const router = express.Router();

router.get('/', authenticateToken, async (req, res) => {
  try {
    const drinks = await prisma.drink.findMany({
      orderBy: { name: 'asc' },
    });
    res.json(drinks);
  } catch (err) {
    console.error('Get drinks error:', err);
    res.status(500).json({ error: 'Greška na serveru.' });
  }
});

router.post('/', authenticateToken, authorize('ADMINISTRATOR'), async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Naziv pića je obavezan.' });
    }
    const drink = await prisma.drink.create({
      data: { name: name.trim() },
    });
    res.status(201).json(drink);
  } catch (err) {
    if (err.code === 'P2002') {
      return res.status(409).json({ error: 'Piće s tim nazivom već postoji.' });
    }
    console.error('Create drink error:', err);
    res.status(500).json({ error: 'Greška na serveru.' });
  }
});

module.exports = router;
