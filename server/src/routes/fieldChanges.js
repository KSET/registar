const express = require('express');
const fs = require('fs');
const path = require('path');

const prisma = require('../lib/prisma');
const { authenticateToken } = require('../middleware/auth');
const { logAction, logError } = require('../utils/auditLog');

const router = express.Router();


router.get('/', authenticateToken, async (req, res) => {
  try {
    const { appRole, memberId } = req.user;

    if (!appRole || appRole === 'CLAN') {
      return res.status(403).json({ error: 'Nemate ovlasti.' });
    }

    let changes;

    if (appRole === 'ADMINISTRATOR') {
      changes = await prisma.pendingFieldChange.findMany({
        where: { status: 'PENDING' },
        include: {
          member: {
            include: { homeSection: true },
          },
        },
        orderBy: { createdAt: 'asc' },
      });
    } else {
    
      const leader = await prisma.member.findUnique({
        where: { id: memberId },
        select: { managedSectionId: true },
      });

      if (!leader || !leader.managedSectionId) {
        return res.status(403).json({ error: 'Niste voditelj nijedne sekcije.' });
      }

      changes = await prisma.pendingFieldChange.findMany({
        where: {
          status: 'PENDING',
          member: { homeSectionId: leader.managedSectionId },
        },
        include: {
          member: {
            include: { homeSection: true },
          },
        },
        orderBy: { createdAt: 'asc' },
      });
    }

    res.json(changes);
  } catch (err) {
    console.error('Get field changes error:', err);
    res.status(500).json({ error: 'Greška na serveru.' });
  }
});

router.patch('/:id/review', authenticateToken, async (req, res) => {
  try {
    const { appRole, memberId } = req.user;

    if (!appRole || appRole === 'CLAN') {
      return res.status(403).json({ error: 'Nemate ovlasti.' });
    }

    const changeId = parseInt(req.params.id);
    const { decision } = req.body;

    if (!['APPROVED', 'REJECTED'].includes(decision)) {
      return res.status(400).json({ error: 'Nevažeća odluka.' });
    }

    const change = await prisma.pendingFieldChange.findUnique({
      where: { id: changeId },
      include: { member: true },
    });

    if (!change) {
      return res.status(404).json({ error: 'Zahtjev nije pronađen.' });
    }

    if (change.status !== 'PENDING') {
      return res.status(400).json({ error: 'Ovaj zahtjev je već obrađen.' });
    }

    if (appRole === 'VODITELJ_SEKCIJE') {
      const leader = await prisma.member.findUnique({
        where: { id: memberId },
        select: { managedSectionId: true },
      });

      if (!leader || leader.managedSectionId !== change.member.homeSectionId) {
        return res.status(403).json({ error: 'Niste voditelj sekcije ovog člana.' });
      }
    }

    if (decision === 'APPROVED') {
      const updateData = {};

      if (change.fieldName === 'membershipLevel') {
        updateData.membershipLevel = change.newValue;
      } else if (change.fieldName === 'certificatePath') {
        
        updateData.certificatePath = change.newValue;
        const now = new Date();
        let year = now.getFullYear();
        const sept30 = new Date(year, 8, 30);
        if (now > sept30) year += 1;
        updateData.certificateValidUntil = new Date(year, 8, 30);
      } else {
        return res.status(400).json({ error: `Nepodržano polje: ${change.fieldName}` });
      }

      await prisma.member.update({
        where: { id: change.memberId },
        data: updateData,
      });

      await prisma.pendingFieldChange.update({
        where: { id: changeId },
        data: { status: 'APPROVED', reviewedBy: memberId },
      });

      await logAction(prisma, 'field_change_reviewed', {
        userId: memberId,
        details: { changeId, fieldName: change.fieldName, decision, targetMemberId: change.memberId },
      });

      return res.json({ message: 'Promjena je odobrena.' });
    } else {
      if (change.fieldName === 'certificatePath' && change.newValue) {
        const filePath = path.join('/app/uploads/certificates', path.basename(change.newValue));
        fs.unlink(filePath, () => {});
      }
      await prisma.pendingFieldChange.update({
        where: { id: changeId },
        data: { status: 'REJECTED', reviewedBy: memberId },
      });

      await logAction(prisma, 'field_change_reviewed', {
        userId: memberId,
        details: { changeId, fieldName: change.fieldName, decision, targetMemberId: change.memberId },
      });

      return res.json({ message: 'Promjena je odbijena.' });
    }
  } catch (err) {
    await logError(prisma, 'field_change_review', err, {
      userId: req.user.memberId,
      details: { changeId: req.params.id },
    });
    res.status(500).json({ error: 'Greška na serveru.' });
  }
});

module.exports = router;
