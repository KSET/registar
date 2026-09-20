const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authenticateToken } = require('../middleware/auth');
const { authorize } = require('../middleware/authorize');

const router = express.Router();
const prisma = new PrismaClient();

router.get('/', authenticateToken, async (req, res) => {
  try {
    const faculties = await prisma.faculty.findMany({ orderBy: { name: 'asc' } });
    res.json(faculties);
  } catch (err) {
    console.error('Get faculties error:', err);
    res.status(500).json({ error: 'Greška na serveru.' });
  }
});

router.post('/', authenticateToken, authorize('ADMINISTRATOR'), async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Naziv fakulteta je obavezan.' });
    }
    const faculty = await prisma.faculty.create({ data: { name: name.trim() } });
    res.status(201).json(faculty);
  } catch (err) {
    if (err.code === 'P2002') {
      return res.status(409).json({ error: 'Fakultet s tim nazivom već postoji.' });
    }
    console.error('Create faculty error:', err);
    res.status(500).json({ error: 'Greška na serveru.' });
  }
});

module.exports = router;
