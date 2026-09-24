const express = require('express');
const prisma = require('../lib/prisma');
const { authenticateToken } = require('../middleware/auth');
const { verifyCurrentRole } = require('../middleware/verifyRole');
const { logAction, logError } = require('../utils/auditLog');
const { parsePositiveIntParam, checkFieldLength } = require('../utils/requestValidation');

const router = express.Router();

// Visible to leaders and admins, same as the regular members list.
router.get('/', authenticateToken, verifyCurrentRole, async (req, res) => {
  try {
    const { appRole } = req.user;
    if (!appRole || appRole === 'CLAN') {
      return res.status(403).json({ error: 'Nemate ovlasti.' });
    }

    const honoraryMembers = await prisma.honoraryMember.findMany({
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });
    res.json(honoraryMembers);
  } catch (err) {
    console.error('Get honorary members error:', err);
    res.status(500).json({ error: 'Greška na serveru.' });
  }
});

// Admin-only: add an honorary member - just a name, nothing else is tracked.
router.post('/', authenticateToken, verifyCurrentRole, async (req, res) => {
  try {
    if (req.user.appRole !== 'ADMINISTRATOR') {
      return res.status(403).json({ error: 'Nemate ovlasti.' });
    }

    const firstName = (req.body.firstName || '').toString().trim();
    const lastName = (req.body.lastName || '').toString().trim();
    if (!firstName || !lastName) {
      return res.status(400).json({ error: 'Ime i prezime su obavezni.' });
    }
    const firstNameError = checkFieldLength('firstName', firstName);
    const lastNameError = checkFieldLength('lastName', lastName);
    if (firstNameError || lastNameError) {
      return res.status(400).json({ error: firstNameError || lastNameError });
    }

    const created = await prisma.honoraryMember.create({ data: { firstName, lastName } });

    await logAction(prisma, 'honorary_member_added', {
      userId: req.user.memberId,
      details: { id: created.id, name: `${firstName} ${lastName}` },
    });

    res.status(201).json(created);
  } catch (err) {
    await logError(prisma, 'honorary_member_add', err, { userId: req.user.memberId });
    res.status(500).json({ error: 'Greška na serveru.' });
  }
});

// Admin-only: remove an honorary member.
router.delete('/:id', authenticateToken, verifyCurrentRole, async (req, res) => {
  try {
    if (req.user.appRole !== 'ADMINISTRATOR') {
      return res.status(403).json({ error: 'Nemate ovlasti.' });
    }

    const id = parsePositiveIntParam(req.params.id);
    if (id === null) {
      return res.status(400).json({ error: 'Nevažeći ID.' });
    }

    const target = await prisma.honoraryMember.findUnique({ where: { id } });
    if (!target) {
      return res.status(404).json({ error: 'Počasni član nije pronađen.' });
    }

    await prisma.honoraryMember.delete({ where: { id } });

    await logAction(prisma, 'honorary_member_removed', {
      userId: req.user.memberId,
      details: { id, name: `${target.firstName} ${target.lastName}` },
    });

    res.json({ message: 'Počasni član je izbrisan.' });
  } catch (err) {
    await logError(prisma, 'honorary_member_remove', err, { userId: req.user.memberId, details: { id: req.params.id } });
    res.status(500).json({ error: 'Greška na serveru.' });
  }
});

module.exports = router;
