const express = require('express');
const multer = require('multer');
const prisma = require('../lib/prisma');
const { authenticateToken } = require('../middleware/auth');
const { verifyCurrentRole } = require('../middleware/verifyRole');
const { logAction, logError } = require('../utils/auditLog');
const { isKsetEmail } = require('../utils/email');
const { isValidOib } = require('../utils/oib');
const { saveCertificateBuffer, deleteCertificate } = require('./uploads');
const { parsePositiveIntParam, validateIdArray, checkFieldLength } = require('../utils/requestValidation');
const { isPdfBuffer } = require('../utils/fileValidation');

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype !== 'application/pdf') {
      return cb(new Error('Dozvoljen je samo PDF.'));
    }
    cb(null, true);
  },
});

// The email that mirrors the applicant's verified Google login is locked -
// for a KSET-domain applicant that's ksetEmail, otherwise it's privateEmail
// (see nonEditableFields below). Any other email the applicant separately
// supplied is editable like any other field.
const NON_EDITABLE_PENDING_FIELDS = [];

// "Ostalo" fields - personal preferences, not identity/eligibility data -
// don't need a leader's explicit sign-off, so new applications start these
// as already APPROVED instead of PENDING. They're still stored and shown
// like any other field, just never block or appear in the review queue.
const AUTO_APPROVED_FIELDS = ['dietType', 'shirtSize', 'drinkIds', 'allergyIds'];

const PENDING_FIELD_VALIDATORS = {
  oib: (v) => (isValidOib(v) ? null : 'OIB nije ispravan.'),
  gender: (v) => (['M', 'Z', 'OSTALO'].includes(v) ? null : 'Nevažeći spol.'),
  membershipLevel: (v) =>
    ['PRIDRUZENO', 'PUNOPRAVNO', 'POCASNO', 'STARO'].includes(v) ? null : 'Nevažeća razina članstva.',
  dietType: (v) =>
    ['MESOJED', 'VEGETARIJANSTVO', 'VEGANSTVO', 'SVEJED'].includes(v) ? null : 'Nevažeći tip prehrane.',
  // Not every member has a @kset.org address, so this may be left blank -
  // only its format is checked when something's actually been entered.
  ksetEmail: (v) => (!v || /^\S+@\S+\.\S+$/.test(v) ? null : 'Nevažeći format KSET e-maila.'),
  // Someone who signed up via a @kset.org Google login still needs a
  // personal address on file (e.g. for after they graduate/leave KSET),
  // so this one stays required specifically for them.
  privateEmail: (v, pending) =>
    isKsetEmail(pending.googleEmail) && !v ? 'Privatni e-mail je obavezan.' : null,
};

function parseArr(v) {
  if (Array.isArray(v)) return v;
  if (typeof v === 'string' && v.trim()) {
    try { return JSON.parse(v); } catch { return []; }
  }
  return [];
}
function parseBool(v) {
  return v === true || v === 'true';
}

// Calculate certificateValidUntil: next September 30.
function nextCertificateValidUntil(now = new Date()) {
  let year = now.getFullYear();
  const sept30 = new Date(year, 8, 30);
  if (now > sept30) year += 1;
  return new Date(year, 8, 30);
}

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

// POST new pending application (multipart: fields + certificate PDF)
router.post('/', authenticateToken, (req, res) => {
  upload.single('certificate')(req, res, async (uploadErr) => {
    let certFilename;
    try {
      if (uploadErr) {
        return res.status(400).json({ error: uploadErr.message });
      }

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
        firstName, lastName, oib, dateOfBirth, address, gender, facultyId, facultyOther,
        phone, privateEmail, memberSince, cardNumber, membershipLevel,
        fullMemberSince, homeSectionId, dietType, shirtSize,
      } = req.body;

      const sectionIds = parseArr(req.body.sectionIds);
      const teamIds = parseArr(req.body.teamIds);
      const drinkIds = parseArr(req.body.drinkIds);
      const allergyIds = parseArr(req.body.allergyIds);
      const acceptedDocuments = parseBool(req.body.acceptedDocuments);

      const isKset = isKsetEmail(email);

      const errors = [];

      if (!firstName || !firstName.trim()) errors.push('Ime je obavezno.');
      if (!lastName || !lastName.trim()) errors.push('Prezime je obavezno.');
      if (!oib || !isValidOib(oib)) errors.push('OIB nije ispravan.');
      if (!dateOfBirth) errors.push('Datum rođenja je obavezan.');
      if (!address || !address.trim()) errors.push('Adresa je obavezna.');
      if (!gender || !['M', 'Z', 'OSTALO'].includes(gender)) errors.push('Spol je obavezan.');
      if (!facultyId && (!facultyOther || !facultyOther.trim())) {
        errors.push('Fakultet je obavezan (odaberi ili upiši pod Ostalo).');
      }
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
      if (!drinkIds || drinkIds.length === 0) errors.push('Morate odabrati barem jedno piće.');
      if (!req.file) errors.push('Potvrda o studiranju je obavezna (PDF).');
      else if (!isPdfBuffer(req.file.buffer)) errors.push('Datoteka nije valjan PDF.');

      for (const [field, val] of Object.entries({ firstName, lastName, address, phone, cardNumber, shirtSize, facultyOther })) {
        const lengthError = checkFieldLength(field, val);
        if (lengthError) errors.push(lengthError);
      }
      const sectionResult = validateIdArray(sectionIds, 'sectionIds');
      const teamResult = validateIdArray(teamIds, 'teamIds');
      const drinkResult = validateIdArray(drinkIds, 'drinkIds');
      const allergyResult = validateIdArray(allergyIds, 'allergyIds');
      for (const r of [sectionResult, teamResult, drinkResult, allergyResult]) {
        if (!r.ok) errors.push(r.error);
      }

      if (errors.length > 0) {
        return res.status(400).json({ errors });
      }

      const { isEmailTaken } = require('../utils/emailUnique');
      const emailsToCheck = isKset ? [email, privateEmail.trim()] : [email];
      for (const e of emailsToCheck) {
        if (await isEmailTaken(e)) {
          return res.status(400).json({ error: `E-mail ${e} je već u upotrebi.` });
        }
      }

      // Save certificate to disk now; path travels with the application.
      certFilename = await saveCertificateBuffer(firstName.trim(), lastName.trim(), req.file.buffer);

      const fieldData = {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        oib,
        dateOfBirth,
        address: address.trim(),
        gender,
        facultyId: facultyId ? parseInt(facultyId) : null,
        facultyOther: facultyOther ? facultyOther.trim() : null,
        phone: phone.trim(),
        privateEmail: isKset ? privateEmail.trim() : email,
        ksetEmail: isKset ? email : null,
        certificatePath: certFilename,
        memberSince,
        cardNumber: cardNumber.trim(),
        membershipLevel,
        fullMemberSince: fullMemberSince || null,
        homeSectionId: parseInt(homeSectionId),
        sectionIds: sectionResult.ids,
        teamIds: teamResult.ids,
        drinkIds: drinkResult.ids,
        allergyIds: allergyResult.ids,
        dietType,
        shirtSize: shirtSize.trim(),
        acceptedDocuments,
      };

      const fieldStatus = {};
      for (const key of Object.keys(fieldData)) {
        fieldStatus[key] = AUTO_APPROVED_FIELDS.includes(key) ? 'APPROVED' : 'PENDING';
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
      if (certFilename) deleteCertificate(certFilename);
      if (err.code === 'P2002') {
        return res.status(409).json({ error: 'Duplikat — prijava već postoji.' });
      }
      await logError(prisma, 'pending_application_create', err, { details: { googleEmail: req.user.email } });
      res.status(500).json({ error: 'Greška na serveru.' });
    }
  });
});

// PATCH re-submit rejected fields (supports certificate re-upload via multipart)
router.patch('/me', authenticateToken, (req, res) => {
  upload.single('certificate')(req, res, async (uploadErr) => {
    let certFilename;
    try {
      if (uploadErr) {
        return res.status(400).json({ error: uploadErr.message });
      }

      const pending = await prisma.pendingMember.findUnique({
        where: { googleEmail: req.user.email },
      });

      if (!pending) {
        return res.status(404).json({ error: 'Nema pending prijave.' });
      }
      if (pending.status !== 'PENDING') {
        return res.status(400).json({ error: 'Prijava više nije na čekanju.' });
      }

      // Non-file fields come as JSON string in `fields`, or as individual body fields.
      let fields = {};
      if (req.body.fields) {
        try { fields = JSON.parse(req.body.fields); } catch { fields = {}; }
      } else {
        fields = { ...req.body };
      }
      // Normalize array-ish fields if present
      for (const arrKey of ['sectionIds', 'teamIds', 'drinkIds', 'allergyIds']) {
        if (arrKey in fields) fields[arrKey] = parseArr(fields[arrKey]);
      }

      const updatedFieldData = { ...pending.fieldData };
      const updatedFieldStatus = { ...pending.fieldStatus };

      const nonEditableFields = pending.fieldData.ksetEmail
        ? NON_EDITABLE_PENDING_FIELDS
        : [...NON_EDITABLE_PENDING_FIELDS, 'privateEmail'];

      // Handle certificate re-upload separately (comes as a file, not in fields)
      if (updatedFieldStatus.certificatePath === 'REJECTED') {
        if (!req.file) {
          return res.status(400).json({ error: 'Potvrda o studiranju je obavezna (PDF).' });
        }
        if (!isPdfBuffer(req.file.buffer)) {
          return res.status(400).json({ error: 'Datoteka nije valjan PDF.' });
        }
        // Delete old rejected file if it still lingers
        if (updatedFieldData.certificatePath) {
          deleteCertificate(updatedFieldData.certificatePath);
        }
        certFilename = await saveCertificateBuffer(
          updatedFieldData.firstName,
          updatedFieldData.lastName,
          req.file.buffer
        );
        updatedFieldData.certificatePath = certFilename;
        updatedFieldStatus.certificatePath = 'PENDING';
      }

      for (const [key, value] of Object.entries(fields)) {
        if (key === 'certificatePath') continue; // handled above via file
        if (nonEditableFields.includes(key)) {
          return res.status(400).json({ error: `Polje "${key}" se ne može mijenjati.` });
        }
        if (updatedFieldStatus[key] !== 'REJECTED') {
          return res.status(400).json({ error: `Polje "${key}" nije moguće uređivati.` });
        }
        const validate = PENDING_FIELD_VALIDATORS[key];
        if (validate) {
          const validationError = validate(value, pending);
          if (validationError) {
            return res.status(400).json({ error: validationError });
          }
        }
        if (['sectionIds', 'teamIds', 'drinkIds', 'allergyIds'].includes(key)) {
          const result = validateIdArray(value, key);
          if (!result.ok) {
            return res.status(400).json({ error: result.error });
          }
          if (key === 'drinkIds' && result.ids.length === 0) {
            return res.status(400).json({ error: 'Morate odabrati barem jedno piće.' });
          }
          updatedFieldData[key] = result.ids;
          updatedFieldStatus[key] = 'PENDING';
          continue;
        }
        const lengthError = checkFieldLength(key, value);
        if (lengthError) {
          return res.status(400).json({ error: lengthError });
        }
        updatedFieldData[key] = value;
        updatedFieldStatus[key] = 'PENDING';
      }

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
      if (certFilename) deleteCertificate(certFilename);
      await logError(prisma, 'pending_application_update', err, { details: { googleEmail: req.user.email } });
      res.status(500).json({ error: 'Greška na serveru.' });
    }
  });
});

// GET all pending applications for section leader / admin
router.get('/section', authenticateToken, verifyCurrentRole, async (req, res) => {
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

// DELETE decline an entire pending application in one action - for when it
// shouldn't have been sent at all, rather than making a leader/admin reject
// every field one by one. Removes it outright instead of leaving it stuck
// in a "waiting for resubmission" limbo the way an all-fields-REJECTED
// review does.
router.delete('/:id', authenticateToken, verifyCurrentRole, async (req, res) => {
  try {
    const { appRole, memberId } = req.user;

    if (!appRole || appRole === 'CLAN') {
      return res.status(403).json({ error: 'Nemate ovlasti.' });
    }

    const pendingId = parsePositiveIntParam(req.params.id);
    if (pendingId === null) {
      return res.status(400).json({ error: 'Nevažeći ID prijave.' });
    }

    const pending = await prisma.pendingMember.findUnique({ where: { id: pendingId } });
    if (!pending) {
      return res.status(404).json({ error: 'Prijava nije pronađena.' });
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

    if (pending.fieldData?.certificatePath) {
      deleteCertificate(pending.fieldData.certificatePath);
    }

    await prisma.pendingMember.delete({ where: { id: pendingId } });

    await logAction(prisma, 'pending_application_declined', {
      userId: memberId,
      details: { pendingId, googleEmail: pending.googleEmail },
    });

    res.json({ message: 'Prijava je odbijena.' });
  } catch (err) {
    await logError(prisma, 'pending_application_decline', err, {
      userId: req.user.memberId,
      details: { pendingId: req.params.id },
    });
    res.status(500).json({ error: 'Greška na serveru.' });
  }
});

// PATCH review pending application - field by field
router.patch('/:id/review', authenticateToken, verifyCurrentRole, async (req, res) => {
  try {
    const { appRole, memberId } = req.user;

    if (!appRole || appRole === 'CLAN') {
      return res.status(403).json({ error: 'Nemate ovlasti.' });
    }

    const pendingId = parsePositiveIntParam(req.params.id);
    if (pendingId === null) {
      return res.status(400).json({ error: 'Nevažeći ID prijave.' });
    }
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

    for (const [field, decision] of Object.entries(decisions)) {
      if (!['APPROVED', 'REJECTED'].includes(decision)) {
        return res.status(400).json({ error: `Nevažeća odluka za polje ${field}: ${decision}` });
      }
      if (fieldStatus[field] === undefined) {
        return res.status(400).json({ error: `Nepoznato polje: ${field}` });
      }
      if (fieldStatus[field] !== 'PENDING') {
        continue;
      }
      fieldStatus[field] = decision;
    }

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
      const data = fieldData;
      const member = await prisma.member.create({
        data: {
          firstName: data.firstName,
          lastName: data.lastName,
          oib: data.oib,
          dateOfBirth: new Date(data.dateOfBirth),
          address: data.address,
          gender: data.gender,
          facultyId: data.facultyId || null,
          facultyOther: data.facultyOther || null,
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
          certificatePath: data.certificatePath || null,
          certificateValidUntil: data.certificatePath ? nextCertificateValidUntil() : null,
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
      const updatedFieldData = { ...fieldData };
      const updatedFieldStatus = { ...fieldStatus };

      for (const [field, status] of Object.entries(fieldStatus)) {
        if (status === 'REJECTED') {
          // Rejected certificate: delete the file from disk
          if (field === 'certificatePath' && updatedFieldData.certificatePath) {
            deleteCertificate(updatedFieldData.certificatePath);
          }
          if (Array.isArray(updatedFieldData[field])) {
            updatedFieldData[field] = [];
          } else if (typeof updatedFieldData[field] === 'boolean') {
            updatedFieldData[field] = false;
          } else {
            updatedFieldData[field] = '';
          }
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
