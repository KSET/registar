const express = require('express');

const prisma = require('../lib/prisma');
const { authenticateToken } = require('../middleware/auth');
const { verifyCurrentRole } = require('../middleware/verifyRole');
const { hasAdminRole } = require('../middleware/authorize');
const { logAction, logError } = require('../utils/auditLog');
const { parsePositiveIntParam } = require('../utils/requestValidation');
const { nextCertificateValidUntil } = require('../utils/certificateValidity');
const { deleteCertificate } = require('./uploads');

const router = express.Router();

// Toggle: when a certificate renewal is approved, delete the file it
// replaces from disk. Set to false to keep superseded certificate files
// around instead (e.g. if you'd rather archive them manually).
const DELETE_SUPERSEDED_CERTIFICATE = true;


router.get('/', authenticateToken, verifyCurrentRole, async (req, res) => {
  try {
    const { appRole, memberId } = req.user;

    if (!hasAdminRole(appRole) && appRole !== 'VODITELJ_SEKCIJE') {
      return res.status(403).json({ error: 'Nemate ovlasti.' });
    }

    let changes;

    if (hasAdminRole(appRole)) {
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

router.patch('/:id/review', authenticateToken, verifyCurrentRole, async (req, res) => {
  try {
    const { appRole, memberId } = req.user;

    if (!hasAdminRole(appRole) && appRole !== 'VODITELJ_SEKCIJE') {
      return res.status(403).json({ error: 'Nemate ovlasti.' });
    }

    const changeId = parsePositiveIntParam(req.params.id);
    if (changeId === null) {
      return res.status(400).json({ error: 'Nevažeći ID zahtjeva.' });
    }
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
      let supersededCertificate = null;

      if (change.fieldName === 'membershipLevel') {
        updateData.membershipLevel = change.newValue;
      } else if (change.fieldName === 'certificatePath') {
        supersededCertificate = change.member.certificatePath;
        updateData.certificatePath = change.newValue;
        const now = new Date();
        updateData.certificateApprovedAt = now;
        updateData.certificateValidUntil = nextCertificateValidUntil(now);
      } else {
        return res.status(400).json({ error: `Nepodržano polje: ${change.fieldName}` });
      }

      await prisma.$transaction(async (tx) => {
        const result = await tx.pendingFieldChange.updateMany({
          where: { id: changeId, status: 'PENDING' },
          data: { status: 'APPROVED', reviewedBy: memberId },
        });
        if (result.count !== 1) throw new Error('Ovaj zahtjev je već obrađen.');
        await tx.member.update({
          where: { id: change.memberId },
          data: updateData,
        });
      });

      if (DELETE_SUPERSEDED_CERTIFICATE && supersededCertificate) {
        deleteCertificate(supersededCertificate);
      }

      await logAction(prisma, 'field_change_reviewed', {
        userId: memberId,
        details: { changeId, fieldName: change.fieldName, decision, targetMemberId: change.memberId },
      });

      return res.json({ message: 'Promjena je odobrena.' });
    } else {
      const result = await prisma.pendingFieldChange.updateMany({
        where: { id: changeId, status: 'PENDING' },
        data: { status: 'REJECTED', reviewedBy: memberId },
      });
      if (result.count !== 1) return res.status(400).json({ error: 'Ovaj zahtjev je već obrađen.' });
      if (change.fieldName === 'certificatePath' && change.newValue) deleteCertificate(change.newValue);

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
