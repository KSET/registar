const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authenticateToken } = require('../middleware/auth');
const { logAction, logError } = require('../utils/auditLog');
const { isKsetEmail } = require('../utils/email');

const router = express.Router();
const prisma = new PrismaClient();

// Always set from the verified Google login, never user-editable.
const NON_EDITABLE_PENDING_FIELDS = ['ksetEmail'];

const PENDING_FIELD_VALIDATORS = {
  oib: (v) => (/^\d{11}$/.test(v) ? null : 'OIB mora imati 11 znamenaka.'),
  gender: (v) => (['M', 'Z'].includes(v) ? null : 'Nevažeći spol.'),
  membershipLevel: (v) =>
    ['PRIDRUZENO', 'PUNOPRAVNO', 'POCASNO', 'STARO'].includes(v) ? null : 'Nevažeća razina članstva.',
  dietType: (v) =>
    ['MESOJED', 'VEGETARIJANSTVO', 'VEGANSTVO', 'SVEJED'].includes(v) ? null : 'Nevažeći tip prehrane.',
};

// GET pending application for current user
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const pending = await prisma.pendingMember.findUnique({
      where: { googleEmail: req.user.email },
      include: { homeSection: true },
    });

    if (!pending) {
      return res.status(404).json({ error: 'Nema pending prijave.' });
    }

    res.json(pending);
  } catch (err) {
    console.error('Get pending me error:', err);
    res.status(500).json({ error: 'Greška na serveru.' });
  }
});

// POST new pending application
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { email } = req.user;

    const existingMember = await prisma.member.findFirst({
      where: {
        OR: [
          { ksetEmail: email, ksetEmailVerified: true },
          { privateEmail: email, privateEmailVerified: true },
        ],
      },
    });
    if (existingMember) {
      return res.status(400).json({ error: 'Već ste registrirani kao član.' });
    }

    const existingPending = await prisma.pendingMember.findUnique({
      where: { googleEmail: email },
    });
    if (existingPending) {
      return res.status(400).json({ error: 'Već imate prijavu na čekanju.' });
    }

    const {
      firstName, lastName, oib, dateOfBirth, address, gender, faculty,
      phone, privateEmail, memberSince, cardNumber, membershipLevel,
      fullMemberSince, homeSectionId, sectionIds, teamIds, drinkIds,
      allergyIds, dietType, shirtSize, acceptedDocuments,
    } = req.body;

    // @kset.org login -> ksetEmail; anything else -> privateEmail.
    // The other slot stays empty until linked later.
    const isKset = isKsetEmail(email);

    const errors = [];

    if (!firstName || !firstName.trim()) errors.push('Ime je obavezno.');
    if (!lastName || !lastName.trim()) errors.push('Prezime je obavezno.');
    if (!oib || !/^\d{11}$/.test(oib)) errors.push('OIB mora imati 11 znamenaka.');
    if (!dateOfBirth) errors.push('Datum rođenja je obavezan.');
    if (!address || !address.trim()) errors.push('Adresa je obavezna.');
    if (!gender || !['M', 'Z'].includes(gender)) errors.push('Spol je obavezan (M ili Ž).');
    if (!faculty || !faculty.trim()) errors.push('Fakultet je obavezan.');
    if (!phone || !phone.trim()) errors.push('Broj telefona je obavezan.');
    if (isKset && (!privateEmail || !privateEmail.trim())) errors.push('Privatni e-mail je obavezan.');
    if (!memberSince) errors.push('Datum učlanjenja je obavezan.');
    if (!cardNumber || !cardNumber.trim()) errors.push('Broj iskaznice je obavezan.');
    if (!membershipLevel || !['PRIDRUZENO', 'PUNOPRAVNO', 'POCASNO', 'STARO'].includes(membershipLevel)) {
      errors.push('Razina članstva je obavezna.');
    }
    if (!homeSectionId) errors.push('Matična sekcija je obavezna.');
    if (!dietType || !['MESOJED', 'VEGETARIJANSTVO', 'VEGANSTVO', 'SVEJED'].includes(dietType)) {
      errors.push('Tip prehrane je obavezan.');
    }
    if (!shirtSize || !shirtSize.trim()) errors.push('Veličina majice je obavezna.');
    if (!acceptedDocuments) errors.push('Morate prihvatiti akte i dokumente udruge.');
    if (!drinkIds || !Array.isArray(drinkIds) || drinkIds.length === 0) {
      errors.push('Morate odabrati barem jedno piće.');
    }

    if (errors.length > 0) {
      return res.status(400).json({ errors });
    }

    const fieldData = {
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      oib,
      dateOfBirth,
      address: address.trim(),
      gender,
      faculty: faculty.trim(),
      phone: phone.trim(),
      privateEmail: isKset ? privateEmail.trim() : email,
      ksetEmail: isKset ? email : null,
      memberSince,
      cardNumber: cardNumber.trim(),
      membershipLevel,
      fullMemberSince: fullMemberSince || null,
      homeSectionId: parseInt(homeSectionId),
      sectionIds: sectionIds || [],
      teamIds: teamIds || [],
      drinkIds,
      allergyIds: allergyIds || [],
      dietType,
      shirtSize: shirtSize.trim(),
      acceptedDocuments,
    };

    const fieldStatus = {};
    for (const key of Object.keys(fieldData)) {
      fieldStatus[key] = 'PENDING';
    }

    const pending = await prisma.pendingMember.create({
      data: {
        googleEmail: email,
        fieldData,
        fieldStatus,
        homeSectionId: parseInt(homeSectionId),
        status: 'PENDING',
      },
      include: { homeSection: true },
    });

    await logAction(prisma, 'pending_application_created', {
      details: { pendingId: pending.id, googleEmail: email, homeSectionId: pending.homeSectionId },
    });

    res.status(201).json(pending);
  } catch (err) {
    if (err.code === 'P2002') {
      return res.status(409).json({ error: 'Duplikat — prijava već postoji.' });
    }
    await logError(prisma, 'pending_application_create', err, { details: { googleEmail: req.user.email } });
    res.status(500).json({ error: 'Greška na serveru.' });
  }
});

// PATCH re-submit rejected fields (Fix #1 & #2)
router.patch('/me', authenticateToken, async (req, res) => {
  try {
    const pending = await prisma.pendingMember.findUnique({
      where: { googleEmail: req.user.email },
    });

    if (!pending) {
      return res.status(404).json({ error: 'Nema pending prijave.' });
    }

    if (pending.status !== 'PENDING') {
      return res.status(400).json({ error: 'Prijava više nije na čekanju.' });
    }

    const { fields } = req.body; // { oib: "12345678901", address: "Nova adresa" }

    if (!fields || typeof fields !== 'object') {
      return res.status(400).json({ error: 'Polja su obavezna.' });
    }

    const updatedFieldData = { ...pending.fieldData };
    const updatedFieldStatus = { ...pending.fieldStatus };

    // If ksetEmail is unset, privateEmail is the verified login
    // email instead and must be locked the same way.
    const nonEditableFields = pending.fieldData.ksetEmail
      ? NON_EDITABLE_PENDING_FIELDS
      : [...NON_EDITABLE_PENDING_FIELDS, 'privateEmail'];

    for (const [key, value] of Object.entries(fields)) {
      if (nonEditableFields.includes(key)) {
        return res.status(400).json({ error: `Polje "${key}" se ne može mijenjati.` });
      }

      // Only allow updating fields that are PENDING (rejected fields reset to PENDING)
      if (updatedFieldStatus[key] !== 'PENDING') {
        return res.status(400).json({ error: `Polje "${key}" nije moguće uređivati.` });
      }

      const validate = PENDING_FIELD_VALIDATORS[key];
      if (validate) {
        const validationError = validate(value);
        if (validationError) {
          return res.status(400).json({ error: validationError });
        }
      }

      updatedFieldData[key] = value;
    }

    // Update homeSectionId on the record if it changed
    const newHomeSectionId = fields.homeSectionId
      ? parseInt(fields.homeSectionId)
      : pending.homeSectionId;

    const updated = await prisma.pendingMember.update({
      where: { id: pending.id },
      data: {
        fieldData: updatedFieldData,
        fieldStatus: updatedFieldStatus,
        homeSectionId: newHomeSectionId,
      },
      include: { homeSection: true },
    });

    await logAction(prisma, 'pending_application_fields_updated', {
      details: { pendingId: pending.id, fields: Object.keys(fields) },
    });

    res.json(updated);
  } catch (err) {
    await logError(prisma, 'pending_application_update', err, { details: { googleEmail: req.user.email } });
    res.status(500).json({ error: 'Greška na serveru.' });
  }
});

// GET all pending applications for section leader / admin
router.get('/section', authenticateToken, async (req, res) => {
  try {
    const { appRole, memberId } = req.user;

    if (!appRole || appRole === 'CLAN') {
      return res.status(403).json({ error: 'Nemate ovlasti.' });
    }

    let pendingList;

    if (appRole === 'ADMINISTRATOR') {
      pendingList = await prisma.pendingMember.findMany({
        where: { status: 'PENDING' },
        include: { homeSection: true },
        orderBy: { createdAt: 'asc' },
      });
    } else if (appRole === 'VODITELJ_SEKCIJE') {
      const leader = await prisma.member.findUnique({
        where: { id: memberId },
        select: { managedSectionId: true },
      });

      if (!leader || !leader.managedSectionId) {
        return res.status(403).json({ error: 'Niste voditelj nijedne sekcije.' });
      }

      pendingList = await prisma.pendingMember.findMany({
        where: {
          status: 'PENDING',
          homeSectionId: leader.managedSectionId,
        },
        include: { homeSection: true },
        orderBy: { createdAt: 'asc' },
      });
    }

    res.json(pendingList);
  } catch (err) {
    console.error('Get pending section error:', err);
    res.status(500).json({ error: 'Greška na serveru.' });
  }
});

// PATCH review pending application - field by field
router.patch('/:id/review', authenticateToken, async (req, res) => {
  try {
    const { appRole, memberId } = req.user;

    if (!appRole || appRole === 'CLAN') {
      return res.status(403).json({ error: 'Nemate ovlasti.' });
    }

    const pendingId = parseInt(req.params.id);
    const { decisions } = req.body;

    if (!decisions || typeof decisions !== 'object') {
      return res.status(400).json({ error: 'Odluke su obavezne.' });
    }

    const pending = await prisma.pendingMember.findUnique({
      where: { id: pendingId },
    });

    if (!pending) {
      return res.status(404).json({ error: 'Pending prijava nije pronađena.' });
    }

    if (pending.status !== 'PENDING') {
      return res.status(400).json({ error: 'Ova prijava više nije na čekanju.' });
    }

    if (appRole === 'VODITELJ_SEKCIJE') {
      const leader = await prisma.member.findUnique({
        where: { id: memberId },
        select: { managedSectionId: true },
      });

      if (!leader || leader.managedSectionId !== pending.homeSectionId) {
        return res.status(403).json({ error: 'Niste voditelj ove sekcije.' });
      }
    }

    const fieldData = pending.fieldData;
    const fieldStatus = { ...pending.fieldStatus };

    // Only allow decisions on PENDING fields
    for (const [field, decision] of Object.entries(decisions)) {
      if (!['APPROVED', 'REJECTED'].includes(decision)) {
        return res.status(400).json({ error: `Nevažeća odluka za polje ${field}: ${decision}` });
      }
      if (fieldStatus[field] === undefined) {
        return res.status(400).json({ error: `Nepoznato polje: ${field}` });
      }
      if (fieldStatus[field] !== 'PENDING') {
        continue; // Skip already decided fields
      }
      fieldStatus[field] = decision;
    }

    // Check if all fields have been decided
    const allReviewed = Object.values(fieldStatus).every((s) => s !== 'PENDING');

    if (!allReviewed) {
      await prisma.pendingMember.update({
        where: { id: pendingId },
        data: { fieldStatus },
      });

      await logAction(prisma, 'pending_application_review_partial', {
        userId: memberId,
        details: { pendingId, decidedFields: Object.keys(decisions) },
      });

      return res.json({
        status: 'partial',
        message: 'Djelomično pregledano. Preostala su neodlučena polja.',
      });
    }

    const hasRejected = Object.values(fieldStatus).some((s) => s === 'REJECTED');

    if (!hasRejected) {
      // ALL APPROVED - create member
      const data = fieldData;

      const now = new Date();
      let year = now.getFullYear();
      const sept30 = new Date(year, 8, 30);
      if (now > sept30) {
        year += 1;
      }
      const certificateValidUntil = new Date(year, 8, 30);

      const member = await prisma.member.create({
        data: {
          firstName: data.firstName,
          lastName: data.lastName,
          oib: data.oib,
          dateOfBirth: new Date(data.dateOfBirth),
          address: data.address,
          gender: data.gender,
          faculty: data.faculty,
          phone: data.phone,
          privateEmail: data.privateEmail,
          privateEmailVerified: !data.ksetEmail,
          ksetEmail: data.ksetEmail,
          ksetEmailVerified: Boolean(data.ksetEmail),
          memberSince: new Date(data.memberSince),
          cardNumber: data.cardNumber,
          membershipLevel: data.membershipLevel,
          fullMemberSince: data.fullMemberSince ? new Date(data.fullMemberSince) : null,
          homeSectionId: data.homeSectionId,
          dietType: data.dietType,
          shirtSize: data.shirtSize,
          acceptedDocuments: data.acceptedDocuments,
          certificateValidUntil,
          appRole: 'CLAN',
          sections: {
            create: (data.sectionIds || []).map((sId) => ({ sectionId: sId })),
          },
          teams: {
            create: (data.teamIds || []).map((tId) => ({ teamId: tId })),
          },
          drinks: {
            create: (data.drinkIds || []).map((dId) => ({ drinkId: dId })),
          },
          allergies: {
            create: (data.allergyIds || []).map((aId) => ({ allergyId: aId })),
          },
        },
      });

      await prisma.pendingMember.delete({
        where: { id: pendingId },
      });

      await logAction(prisma, 'pending_application_approved', {
        userId: memberId,
        details: { pendingId, newMemberId: member.id, googleEmail: pending.googleEmail },
      });

      return res.json({ status: 'approved', message: 'Član je prihvaćen.', member });
    } else {
      // SOME REJECTED
      const updatedFieldData = { ...fieldData };
      const updatedFieldStatus = { ...fieldStatus };

      for (const [field, status] of Object.entries(fieldStatus)) {
        if (status === 'REJECTED') {
          if (Array.isArray(updatedFieldData[field])) {
            updatedFieldData[field] = [];
          } else if (typeof updatedFieldData[field] === 'boolean') {
            updatedFieldData[field] = false;
          } else {
            updatedFieldData[field] = '';
          }
          updatedFieldStatus[field] = 'PENDING';
        }
      }

      await prisma.pendingMember.update({
        where: { id: pendingId },
        data: {
          fieldData: updatedFieldData,
          fieldStatus: updatedFieldStatus,
        },
      });

      const rejectedFields = Object.entries(fieldStatus)
        .filter(([, s]) => s === 'REJECTED')
        .map(([field]) => field);

      await logAction(prisma, 'pending_application_fields_rejected', {
        userId: memberId,
        details: { pendingId, rejectedFields },
      });

      return res.json({
        status: 'rejected',
        message: 'Neka polja su odbijena. Član mora popuniti odbijena polja.',
      });
    }
  } catch (err) {
    if (err.code === 'P2002') {
      return res.status(409).json({ error: 'Duplikat — član s tim OIB-om, e-mailom ili brojem iskaznice već postoji.' });
    }
    await logError(prisma, 'pending_application_review', err, {
      userId: req.user.memberId,
      details: { pendingId: req.params.id },
    });
    res.status(500).json({ error: 'Greška na serveru.' });
  }
});

module.exports = router;
