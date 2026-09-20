const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authenticateToken } = require('../middleware/auth');
const { logAction, logError } = require('../utils/auditLog');

const router = express.Router();
const prisma = new PrismaClient();

const LOCKED_FIELDS = ['oib', 'dateOfBirth', 'cardNumber', 'memberSince'];
const APPROVAL_FIELDS = ['membershipLevel'];
const CERTIFICATE_FIELDS = ['certificatePath', 'certificateValidUntil'];

const EDITABLE_SCALAR_FIELDS = [
  'firstName',
  'lastName',
  'address',
  'gender',
  'phone',
  'privateEmail',
  'fullMemberSince',
  'dietType',
  'shirtSize',
];

router.get('/me', authenticateToken, async (req, res) => {
  try {
    const { memberId } = req.user;

    if (!memberId) {
      return res.status(404).json({ error: 'Niste registrirani član.' });
    }

    const member = await prisma.member.findUnique({
      where: { id: memberId },
      include: {
        homeSection: true,
        faculty: true,
        sections: { include: { section: true } },
        teams: { include: { team: true } },
        drinks: { include: { drink: true } },
        allergies: { include: { allergy: true } },
      },
    });

    if (!member) {
      return res.status(404).json({ error: 'Član nije pronađen.' });
    }

    const pendingChanges = await prisma.pendingFieldChange.findMany({
      where: { memberId, status: 'PENDING' },
      select: { id: true, fieldName: true, newValue: true, createdAt: true },
    });

    res.json({ ...member, pendingChanges });
  } catch (err) {
    console.error('Get member me error:', err);
    res.status(500).json({ error: 'Greška na serveru.' });
  }
});

router.patch('/me', authenticateToken, async (req, res) => {
  try {
    const { memberId } = req.user;

    if (!memberId) {
      return res.status(404).json({ error: 'Niste registrirani član.' });
    }

    const body = req.body;

    for (const field of LOCKED_FIELDS) {
      if (field in body) {
        return res.status(400).json({ error: `Polje "${field}" se ne može mijenjati.` });
      }
    }

    for (const field of CERTIFICATE_FIELDS) {
      if (field in body) {
        return res.status(400).json({ error: 'Potvrda o studiranju se mijenja kroz zaseban upload.' });
      }
    }

    let membershipChangeResult = null;
    if ('membershipLevel' in body) {
      const newLevel = body.membershipLevel;

      if (!['PRIDRUZENO', 'PUNOPRAVNO', 'POCASNO', 'STARO'].includes(newLevel)) {
        return res.status(400).json({ error: 'Nevažeća razina članstva.' });
      }

      const member = await prisma.member.findUnique({
        where: { id: memberId },
        select: { membershipLevel: true },
      });

      if (newLevel !== member.membershipLevel) {
        const existing = await prisma.pendingFieldChange.findFirst({
          where: { memberId, fieldName: 'membershipLevel', status: 'PENDING' },
        });

        if (existing) {
          return res.status(400).json({ error: 'Već ste zatražili promjenu članstva. Čeka odobrenje voditelja.' });
        }

        await prisma.pendingFieldChange.create({
          data: {
            memberId,
            fieldName: 'membershipLevel',
            newValue: newLevel,
            status: 'PENDING',
          },
        });

        membershipChangeResult = 'Promjena članstva poslana voditelju na odobrenje.';

        await logAction(prisma, 'membership_change_requested', {
          userId: memberId,
          details: { requestedLevel: newLevel, previousLevel: member.membershipLevel },
        });
      }
    }

    const data = {};
    for (const field of EDITABLE_SCALAR_FIELDS) {
      if (field in body) {
        if (field === 'fullMemberSince') {
          data[field] = body[field] ? new Date(body[field]) : null;
        } else {
          const val = body[field];
          if (typeof val === 'string' && !val.trim()) {
            return res.status(400).json({ error: `Polje "${field}" ne smije biti prazno.` });
          }
          data[field] = typeof val === 'string' ? val.trim() : val;
        }
      }
    }

    if ('facultyId' in body || 'facultyOther' in body) {
      const fid = body.facultyId ? parseInt(body.facultyId) : null;
      const fother = body.facultyOther ? String(body.facultyOther).trim() : null;
      if (!fid && !fother) {
        return res.status(400).json({ error: 'Fakultet je obavezan.' });
      }
      data.facultyId = fid;
      data.facultyOther = fother;
    }

    if ('gender' in data && !['M', 'Z'].includes(data.gender)) {
      return res.status(400).json({ error: 'Nevažeći spol.' });
    }
    if ('dietType' in data && !['MESOJED', 'VEGETARIJANSTVO', 'VEGANSTVO', 'SVEJED'].includes(data.dietType)) {
      return res.status(400).json({ error: 'Nevažeći tip prehrane.' });
    }
    if ('privateEmail' in data && data.privateEmail && !/^\S+@\S+\.\S+$/.test(data.privateEmail)) {
      return res.status(400).json({ error: 'Nevažeći format privatnog e-maila.' });
    }

    if ('privateEmail' in data) {
      // A changed value is unverified until re-confirmed via /google/link.
      const current = await prisma.member.findUnique({
        where: { id: memberId },
        select: { privateEmail: true },
      });
      if (current && data.privateEmail !== current.privateEmail) {
        data.privateEmailVerified = false;
      }
    }

    const relationUpdates = {};
    if ('sectionIds' in body) {
      if (!Array.isArray(body.sectionIds)) {
        return res.status(400).json({ error: 'sectionIds mora biti niz.' });
      }
      relationUpdates.sections = {
        deleteMany: {},
        create: body.sectionIds.map((id) => ({ sectionId: parseInt(id) })),
      };
    }
    if ('teamIds' in body) {
      if (!Array.isArray(body.teamIds)) {
        return res.status(400).json({ error: 'teamIds mora biti niz.' });
      }
      relationUpdates.teams = {
        deleteMany: {},
        create: body.teamIds.map((id) => ({ teamId: parseInt(id) })),
      };
    }
    if ('drinkIds' in body) {
      if (!Array.isArray(body.drinkIds) || body.drinkIds.length === 0) {
        return res.status(400).json({ error: 'Morate odabrati barem jedno piće.' });
      }
      relationUpdates.drinks = {
        deleteMany: {},
        create: body.drinkIds.map((id) => ({ drinkId: parseInt(id) })),
      };
    }
    if ('allergyIds' in body) {
      if (!Array.isArray(body.allergyIds)) {
        return res.status(400).json({ error: 'allergyIds mora biti niz.' });
      }
      relationUpdates.allergies = {
        deleteMany: {},
        create: body.allergyIds.map((id) => ({ allergyId: parseInt(id) })),
      };
    }

    const updated = await prisma.member.update({
      where: { id: memberId },
      data: { ...data, ...relationUpdates },
      include: {
        homeSection: true,
        faculty: true,
        sections: { include: { section: true } },
        teams: { include: { team: true } },
        drinks: { include: { drink: true } },
        allergies: { include: { allergy: true } },
      },
    });

    const pendingChanges = await prisma.pendingFieldChange.findMany({
      where: { memberId, status: 'PENDING' },
      select: { id: true, fieldName: true, newValue: true, createdAt: true },
    });

    await logAction(prisma, 'member_profile_updated', {
      userId: memberId,
      details: { updatedFields: Object.keys(data), relationsUpdated: Object.keys(relationUpdates) },
    });

    res.json({
      ...updated,
      pendingChanges,
      notice: membershipChangeResult,
    });
  } catch (err) {
    await logError(prisma, 'member_profile_update', err, { userId: req.user.memberId });
    res.status(500).json({ error: 'Greška na serveru.' });
  }
});

module.exports = router;
