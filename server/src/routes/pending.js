const express = require('express');
const multer = require('multer');
const prisma = require('../lib/prisma');
const { authenticateToken } = require('../middleware/auth');
const { verifyCurrentRole } = require('../middleware/verifyRole');
const { hasAdminRole } = require('../middleware/authorize');
const { logAction, logError } = require('../utils/auditLog');
const { isKsetEmail } = require('../utils/email');
const { isValidOib } = require('../utils/oib');
const { saveCertificateBuffer, deleteCertificate } = require('./uploads');
const { parsePositiveIntParam, isValidDateOnly, validateIdArray, checkFieldLength } = require('../utils/requestValidation');
const { isPdfBuffer, normalizePdfBuffer } = require('../utils/fileValidation');
const { REFERRAL_SOURCE_OPTIONS } = require('../utils/referralSources');

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
const NON_EDITABLE_PENDING_FIELDS = ['membershipLevel', 'cardNumber', 'memberSince'];

// These values do not require applicant or leader decisions: preferences and
// the optional transport volunteer preference can be updated later.
const AUTO_APPROVED_FIELDS = [
  'dietType', 'shirtSize', 'drinkIds', 'allergyIds', 'transportVolunteer',
];

const requiredPendingText = (label) => (value) =>
  typeof value === 'string' && value.trim() ? null : `${label} je obavezno polje.`;

const PENDING_FIELD_VALIDATORS = {
  oib: (v) => (isValidOib(v) ? null : 'OIB nije ispravan.'),
  dateOfBirth: (v) => (isValidDateOnly(v) ? null : 'Datum rođenja nije ispravan.'),
  homeSectionId: (v) => (parsePositiveIntParam(v) !== null ? null : 'Matična sekcija nije ispravna.'),
  address: requiredPendingText('Adresa'),
  houseNumber: requiredPendingText('Kućni broj'),
  postalCode: requiredPendingText('Poštanski broj'),
  city: requiredPendingText('Mjesto'),
  gender: (v) => (['M', 'Z', 'OSTALO'].includes(v) ? null : 'Nevažeći spol.'),
  membershipLevel: (v) =>
    ['PRIDRUZENO', 'PUNOPRAVNO', 'POCASNO', 'STARO'].includes(v) ? null : 'Nevažeća razina članstva.',
  dietType: (v) =>
    ['MESOJED', 'VEGETARIJANSTVO', 'VEGANSTVO', 'SVEJED'].includes(v) ? null : 'Nevažeći tip prehrane.',
  transportVolunteer: (v) =>
    typeof v === 'boolean' ? null : 'Nevažeći odabir prijevoza.',
  // Not every member has a @kset.org address, so this may be left blank -
  // only its format is checked when something's actually been entered.
  ksetEmail: (v) => (!v || /^\S+@\S+\.\S+$/.test(v) ? null : 'Nevažeći format KSET e-maila.'),
  // Someone who signed up via a @kset.org Google login still needs a
  // personal address on file (e.g. for after they graduate/leave KSET),
  // so this one stays required specifically for them.
  privateEmail: (v, pending) =>
    isKsetEmail(pending.googleEmail) && !v ? 'Privatni e-mail je obavezan.' : null,
  referralSource: (v) =>
    REFERRAL_SOURCE_OPTIONS.includes(v) ? null : 'Odaberite kako ste saznali za KSET.',
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

async function deletePendingCertificate(filename) {
  if (!filename) return;
  try {
    const memberUsesFile = await prisma.member.findFirst({
      where: { certificatePath: filename },
      select: { id: true },
    });
    if (!memberUsesFile) deleteCertificate(filename);
  } catch (error) {
    console.warn('Could not verify pending certificate ownership; leaving the file in place.');
  }
}

async function findExistingMember(client, pending) {
  const email = String(pending.googleEmail || '').trim();
  const oib = String(pending.fieldData?.oib || '').trim();
  const emailMatches = await client.member.findMany({
    where: {
      OR: [
        { privateEmail: { equals: email, mode: 'insensitive' } },
        { ksetEmail: { equals: email, mode: 'insensitive' } },
      ],
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      oib: true,
    },
  });

  const oibMatch = oib
    ? await client.member.findUnique({
      where: { oib },
      select: { id: true, firstName: true, lastName: true, oib: true },
    })
    : null;

  if (emailMatches.length > 1) return { member: null, conflict: true };
  const emailMatch = emailMatches[0] || null;
  if (emailMatch && oib && emailMatch.oib !== oib) return { member: null, conflict: true };
  if (emailMatch && oibMatch && emailMatch.id !== oibMatch.id) {
    return { member: null, conflict: true };
  }

  const identity = oibMatch || emailMatch;
  if (!identity) return { member: null, conflict: false };

  const member = await client.member.findUnique({
    where: { id: identity.id },
    include: {
      sections: { select: { sectionId: true } },
      teams: { select: { teamId: true } },
      drinks: { select: { drinkId: true } },
      allergies: { select: { allergyId: true } },
    },
  });
  return { member, conflict: false };
}

function asDateOnly(value) {
  if (!value) return null;
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
}

function existingMemberFieldData(member) {
  return {
    firstName: member.firstName,
    lastName: member.lastName,
    oib: member.oib,
    dateOfBirth: asDateOnly(member.dateOfBirth),
    address: member.address,
    houseNumber: member.houseNumber,
    postalCode: member.postalCode,
    city: member.city,
    gender: member.gender,
    facultyId: member.facultyId,
    facultyOther: member.facultyOther,
    phone: member.phone,
    privateEmail: member.privateEmail,
    ksetEmail: member.ksetEmail,
    certificatePath: member.certificatePath,
    cardNumber: member.cardNumber,
    membershipLevel: member.membershipLevel,
    fullMemberSince: asDateOnly(member.fullMemberSince),
    homeSectionId: member.homeSectionId,
    sectionIds: member.sections.map(({ sectionId }) => sectionId).sort((a, b) => a - b),
    teamIds: member.teams.map(({ teamId }) => teamId).sort((a, b) => a - b),
    drinkIds: member.drinks.map(({ drinkId }) => drinkId).sort((a, b) => a - b),
    allergyIds: member.allergies.map(({ allergyId }) => allergyId).sort((a, b) => a - b),
    dietType: member.dietType,
    shirtSize: member.shirtSize,
    transportVolunteer: member.transportVolunteer,
    acceptedDocuments: member.acceptedDocuments,
    referralSource: member.referralSource,
  };
}

function mergeExistingMemberFields(pending, member) {
  const fieldData = { ...pending.fieldData };
  const fieldStatus = { ...pending.fieldStatus };
  const memberData = existingMemberFieldData(member);

  for (const [field, memberValue] of Object.entries(memberData)) {
    if (fieldStatus[field] !== 'PENDING') continue;
    if (fieldData[field] === null && memberValue !== null && memberValue !== undefined) {
      fieldData[field] = memberValue;
      fieldStatus[field] = 'APPROVED';
      continue;
    }

    const requestValue = fieldData[field];
    const normalize = (value) => {
      if (field === 'privateEmail' || field === 'ksetEmail') {
        return typeof value === 'string' ? value.trim().toLowerCase() : value;
      }
      if (Array.isArray(value)) return [...value].sort((a, b) => a - b);
      return value;
    };
    if (JSON.stringify(normalize(requestValue)) === JSON.stringify(normalize(memberValue))) {
      fieldStatus[field] = 'APPROVED';
    }
  }

  return { fieldData, fieldStatus };
}

async function updateExistingMemberRecord(tx, pending, existingMember, fieldData, fieldStatus) {
  const identity = await findExistingMember(tx, pending);
  if (
    identity.conflict
    || identity.member?.id !== existingMember.id
    || identity.member.updatedAt.getTime() !== existingMember.updatedAt.getTime()
  ) {
    const error = new Error('Identitet postojećeg člana više nije jednoznačan.');
    error.code = 'PENDING_MEMBER_IDENTITY_CONFLICT';
    throw error;
  }

  const scalarFields = {
    firstName: 'firstName',
    lastName: 'lastName',
    oib: 'oib',
    dateOfBirth: 'dateOfBirth',
    address: 'address',
    houseNumber: 'houseNumber',
    postalCode: 'postalCode',
    city: 'city',
    gender: 'gender',
    facultyId: 'facultyId',
    facultyOther: 'facultyOther',
    phone: 'phone',
    privateEmail: 'privateEmail',
    ksetEmail: 'ksetEmail',
    cardNumber: 'cardNumber',
    membershipLevel: 'membershipLevel',
    fullMemberSince: 'fullMemberSince',
    homeSectionId: 'homeSectionId',
    dietType: 'dietType',
    shirtSize: 'shirtSize',
    transportVolunteer: 'transportVolunteer',
    acceptedDocuments: 'acceptedDocuments',
    referralSource: 'referralSource',
  };
  const dateFields = new Set(['dateOfBirth', 'fullMemberSince']);
  const nullableTextFields = new Set([
    'houseNumber', 'postalCode', 'city', 'facultyOther', 'referralSource',
  ]);
  const updateData = {};

  for (const [field, column] of Object.entries(scalarFields)) {
    if (fieldStatus[field] !== 'APPROVED') continue;
    const value = fieldData[field];
    if (dateFields.has(field)) {
      updateData[column] = value ? new Date(value) : null;
    } else if (nullableTextFields.has(field)) {
      updateData[column] = value || null;
    } else if (field === 'facultyId') {
      updateData[column] = value || null;
    } else if (field === 'transportVolunteer' || field === 'acceptedDocuments') {
      updateData[column] = Boolean(value);
    } else {
      updateData[column] = value;
    }
  }

  if (fieldStatus.privateEmail === 'APPROVED'
    && fieldData.privateEmail?.toLowerCase() !== existingMember.privateEmail.toLowerCase()) {
    updateData.privateEmailVerified = fieldData.privateEmail?.trim().toLowerCase()
      === pending.googleEmail.trim().toLowerCase();
  }
  if (fieldStatus.ksetEmail === 'APPROVED'
    && fieldData.ksetEmail?.toLowerCase() !== existingMember.ksetEmail?.toLowerCase()) {
    updateData.ksetEmailVerified = Boolean(fieldData.ksetEmail)
      && fieldData.ksetEmail.trim().toLowerCase() === pending.googleEmail.trim().toLowerCase();
  }

  if (fieldStatus.certificatePath === 'APPROVED'
    && fieldData.certificatePath
    && fieldData.certificatePath !== existingMember.certificatePath) {
    updateData.certificatePath = fieldData.certificatePath;
    updateData.certificateValidUntil = nextCertificateValidUntil();
    updateData.certificateApprovedAt = new Date();
  }

  const member = await tx.member.update({
    where: { id: existingMember.id },
    data: updateData,
  });

  const relations = [
    ['sectionIds', 'memberSection', 'sectionId'],
    ['teamIds', 'memberTeam', 'teamId'],
    ['drinkIds', 'memberDrink', 'drinkId'],
    ['allergyIds', 'memberAllergy', 'allergyId'],
  ];
  for (const [field, model, foreignKey] of relations) {
    if (fieldStatus[field] !== 'APPROVED') continue;
    await tx[model].deleteMany({ where: { memberId: existingMember.id } });
    const ids = Array.isArray(fieldData[field]) ? fieldData[field] : [];
    if (ids.length > 0) {
      await tx[model].createMany({
        data: ids.map((id) => ({ memberId: existingMember.id, [foreignKey]: id })),
        skipDuplicates: true,
      });
    }
  }

  return member;
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
        firstName, lastName, oib, dateOfBirth, address, houseNumber, postalCode, city,
        gender, facultyId, facultyOther, phone, privateEmail, homeSectionId, dietType, shirtSize,
        referralSource,
      } = req.body;

      const sectionIds = parseArr(req.body.sectionIds);
      const teamIds = parseArr(req.body.teamIds);
      const drinkIds = parseArr(req.body.drinkIds);
      const allergyIds = parseArr(req.body.allergyIds);
      const transportVolunteer = parseBool(req.body.transportVolunteer);
      const acceptedDocuments = parseBool(req.body.acceptedDocuments);

      if (req.file) req.file.buffer = normalizePdfBuffer(req.file.buffer);

      const isKset = isKsetEmail(email);

      const errors = [];

      if (!firstName || !firstName.trim()) errors.push('Ime je obavezno.');
      if (!lastName || !lastName.trim()) errors.push('Prezime je obavezno.');
      if (!oib || !isValidOib(oib)) errors.push('OIB nije ispravan.');
      if (!isValidDateOnly(dateOfBirth)) errors.push('Datum rođenja nedostaje ili nije ispravan.');
      if (!address || !address.trim()) errors.push('Adresa je obavezna.');
      if (!houseNumber || !houseNumber.trim()) errors.push('Kućni broj je obavezan.');
      if (!postalCode || !postalCode.trim()) errors.push('Poštanski broj je obavezan.');
      if (!city || !city.trim()) errors.push('Mjesto je obavezno.');
      if (!gender || !['M', 'Z', 'OSTALO'].includes(gender)) errors.push('Spol je obavezan.');
      if (!REFERRAL_SOURCE_OPTIONS.includes(referralSource)) errors.push('Odaberite kako ste saznali za KSET.');
      const parsedFacultyId = facultyId ? parsePositiveIntParam(facultyId) : null;
      if (facultyId && parsedFacultyId === null) errors.push('Nevažeći fakultet.');
      if (!parsedFacultyId && (!facultyOther || !facultyOther.trim())) {
        errors.push('Fakultet je obavezan (odaberi ili upiši pod Ostalo).');
      }
      if (!phone || !phone.trim()) errors.push('Broj telefona je obavezan.');
      if (isKset && (!privateEmail || !privateEmail.trim())) errors.push('Privatni e-mail je obavezan.');
      const parsedHomeSectionId = parsePositiveIntParam(homeSectionId);
      if (parsedHomeSectionId === null) errors.push('Matična sekcija je obavezna.');
      if (!dietType || !['MESOJED', 'VEGETARIJANSTVO', 'VEGANSTVO', 'SVEJED'].includes(dietType)) {
        errors.push('Tip prehrane je obavezan.');
      }
      if (!shirtSize || !shirtSize.trim()) errors.push('Veličina majice je obavezna.');
      if (!acceptedDocuments) errors.push('Morate prihvatiti akte i dokumente udruge.');
      if (req.body.transportVolunteer !== undefined && !['true', 'false'].includes(req.body.transportVolunteer)) {
        errors.push('Nevažeći odabir prijevoza.');
      }
      if (!drinkIds || drinkIds.length === 0) errors.push('Morate odabrati barem jedno piće.');
      if (!req.file) errors.push('Potvrda o studiranju je obavezna (PDF).');
      else if (!isPdfBuffer(req.file.buffer)) errors.push('Datoteka nije valjan PDF.');

      for (const [field, val] of Object.entries({ firstName, lastName, address, houseNumber, postalCode, city, phone, shirtSize, facultyOther })) {
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
      if (sectionResult.ok && parsedHomeSectionId !== null && sectionResult.ids.includes(parsedHomeSectionId)) {
        errors.push('Matična sekcija ne može biti i pridružena sekcija.');
      }
      if (sectionResult.ok && sectionResult.ids.length > 0) {
        const mediaSection = await prisma.section.findUnique({
          where: { name: 'Media' },
          select: { id: true },
        });
        if (!mediaSection || sectionResult.ids.some((id) => id !== mediaSection.id)) {
          errors.push('Plavi članovi mogu odabrati samo Mediju kao pridruženu sekciju.');
        }
      }

      const relationChecks = [
        [sectionResult, prisma.section, 'sekcije'],
        [teamResult, prisma.team, 'timovi'],
        [drinkResult, prisma.drink, 'pića'],
        [allergyResult, prisma.allergy, 'alergije'],
      ];
      for (const [result, model, label] of relationChecks) {
        if (!result.ok) continue;
        if (new Set(result.ids).size !== result.ids.length) {
          errors.push(`Odabir sadrži duplicirane stavke (${label}).`);
          continue;
        }
        if (result.ids.length > 0) {
          const found = await model.count({ where: { id: { in: result.ids } } });
          if (found !== result.ids.length) errors.push(`Odabir sadrži nepostojeće stavke (${label}).`);
        }
      }
      if (parsedHomeSectionId !== null) {
        const homeSection = await prisma.section.findUnique({ where: { id: parsedHomeSectionId }, select: { id: true } });
        if (!homeSection) errors.push('Matična sekcija ne postoji.');
      }
      if (parsedFacultyId !== null) {
        const faculty = await prisma.faculty.findUnique({ where: { id: parsedFacultyId }, select: { id: true } });
        if (!faculty) errors.push('Odabrani fakultet ne postoji.');
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
        houseNumber: houseNumber.trim(),
        postalCode: postalCode.trim(),
        city: city.trim(),
        gender,
        facultyId: parsedFacultyId,
        facultyOther: facultyOther ? facultyOther.trim() : null,
        phone: phone.trim(),
        privateEmail: isKset ? privateEmail.trim() : email,
        ksetEmail: isKset ? email : null,
        certificatePath: certFilename,
        cardNumber: null,
        membershipLevel: 'PRIDRUZENO',
        fullMemberSince: null,
        homeSectionId: parsedHomeSectionId,
        sectionIds: sectionResult.ids,
        teamIds: teamResult.ids,
        drinkIds: drinkResult.ids,
        allergyIds: allergyResult.ids,
        dietType,
        shirtSize: shirtSize.trim(),
        transportVolunteer,
        acceptedDocuments,
        referralSource,
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
          homeSectionId: parsedHomeSectionId,
          status: 'PENDING',
        },
        include: { homeSection: true },
      });

      await logAction(prisma, 'pending_application_created', {
        details: { pendingId: pending.id, googleEmail: email, homeSectionId: pending.homeSectionId },
      });

      res.status(201).json(pending);
    } catch (err) {
      if (certFilename) await deletePendingCertificate(certFilename);
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

      const replacingRejectedCertificate = updatedFieldStatus.certificatePath === 'REJECTED';
      const previousRejectedCertificate = updatedFieldData.certificatePath;
      if (replacingRejectedCertificate) {
        if (!req.file) {
          return res.status(400).json({ error: 'Potvrda o studiranju je obavezna (PDF).' });
        }
        req.file.buffer = normalizePdfBuffer(req.file.buffer);
        if (!isPdfBuffer(req.file.buffer)) {
          return res.status(400).json({ error: 'Datoteka nije valjan PDF.' });
        }
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
          if (new Set(result.ids).size !== result.ids.length) {
            return res.status(400).json({ error: `${key} sadrži duplicirane stavke.` });
          }
          if (key === 'drinkIds' && result.ids.length === 0) {
            return res.status(400).json({ error: 'Morate odabrati barem jedno piće.' });
          }
          const model = {
            sectionIds: prisma.section,
            teamIds: prisma.team,
            drinkIds: prisma.drink,
            allergyIds: prisma.allergy,
          }[key];
          if (result.ids.length > 0) {
            const found = await model.count({ where: { id: { in: result.ids } } });
            if (found !== result.ids.length) {
              return res.status(400).json({ error: `${key} sadrži nepostojeće stavke.` });
            }
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
        ? parsePositiveIntParam(fields.homeSectionId)
        : pending.homeSectionId;
      if (fields.homeSectionId) {
        const homeSection = await prisma.section.findUnique({ where: { id: newHomeSectionId }, select: { id: true } });
        if (!homeSection) return res.status(400).json({ error: 'Odabrana matična sekcija ne postoji.' });
      }
      if ((updatedFieldData.sectionIds || []).includes(newHomeSectionId)) {
        return res.status(400).json({ error: 'Matična sekcija ne može biti i pridružena sekcija.' });
      }

      if (replacingRejectedCertificate) {
        certFilename = await saveCertificateBuffer(
          updatedFieldData.firstName,
          updatedFieldData.lastName,
          req.file.buffer
        );
        updatedFieldData.certificatePath = certFilename;
        updatedFieldStatus.certificatePath = 'PENDING';
      }

      const updated = await prisma.pendingMember.update({
        where: { id: pending.id },
        data: {
          fieldData: updatedFieldData,
          fieldStatus: updatedFieldStatus,
          homeSectionId: newHomeSectionId,
        },
        include: { homeSection: true },
      });

      if (replacingRejectedCertificate && previousRejectedCertificate) {
        await deletePendingCertificate(previousRejectedCertificate);
      }

      await logAction(prisma, 'pending_application_fields_updated', {
        details: { pendingId: pending.id, fields: Object.keys(fields) },
      });

      res.json(updated);
    } catch (err) {
      if (certFilename) await deletePendingCertificate(certFilename);
      await logError(prisma, 'pending_application_update', err, { details: { googleEmail: req.user.email } });
      res.status(500).json({ error: 'Greška na serveru.' });
    }
  });
});

// GET all pending applications for section leader / admin
router.get('/section', authenticateToken, verifyCurrentRole, async (req, res) => {
  try {
    const { appRole, memberId } = req.user;

    if (!hasAdminRole(appRole) && appRole !== 'VODITELJ_SEKCIJE') {
      return res.status(403).json({ error: 'Nemate ovlasti.' });
    }

    let pendingList;

    if (hasAdminRole(appRole)) {
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

    const pendingWithExistingMembers = await Promise.all(pendingList.map(async (pending) => {
      const { member, conflict } = await findExistingMember(prisma, pending);
      const merged = member ? mergeExistingMemberFields(pending, member) : null;
      return {
        ...pending,
        ...(merged || {}),
        existingMember: member
          ? { id: member.id, firstName: member.firstName, lastName: member.lastName }
          : null,
        existingMemberConflict: conflict,
      };
    }));

    res.json(pendingWithExistingMembers);
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

    if (!hasAdminRole(appRole) && appRole !== 'VODITELJ_SEKCIJE') {
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
      await deletePendingCertificate(pending.fieldData.certificatePath);
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

    if (!hasAdminRole(appRole) && appRole !== 'VODITELJ_SEKCIJE') {
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

    const identity = await findExistingMember(prisma, pending);
    if (identity.conflict) {
      return res.status(409).json({
        error: 'E-mail i OIB zahtjeva ne upućuju jednoznačno na istog člana. Ručno provjerite identitet.',
      });
    }
    const existingMember = identity.member;
    const merged = existingMember ? mergeExistingMemberFields(pending, existingMember) : null;

    if (appRole === 'VODITELJ_SEKCIJE') {
      const leader = await prisma.member.findUnique({
        where: { id: memberId },
        select: { managedSectionId: true },
      });

      if (!leader || leader.managedSectionId !== pending.homeSectionId) {
        return res.status(403).json({ error: 'Niste voditelj ove sekcije.' });
      }
    }

    const fieldData = merged?.fieldData || pending.fieldData;
    const fieldStatus = { ...(merged?.fieldStatus || pending.fieldStatus) };

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
      const saved = await prisma.pendingMember.updateMany({
        where: { id: pendingId, status: 'PENDING', updatedAt: pending.updatedAt },
        data: { fieldData, fieldStatus },
      });
      if (saved.count !== 1) {
        return res.status(409).json({ error: 'Prijavu je u međuvremenu pregledao drugi korisnik. Osvježite prikaz.' });
      }

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
      const member = await prisma.$transaction(async (tx) => {
        let savedMember;
        if (existingMember) {
          savedMember = await updateExistingMemberRecord(
            tx,
            pending,
            existingMember,
            data,
            fieldStatus
          );
        } else {
          savedMember = await tx.member.create({
            data: {
              firstName: data.firstName,
              lastName: data.lastName,
              oib: data.oib,
              dateOfBirth: new Date(data.dateOfBirth),
              address: data.address,
              houseNumber: data.houseNumber,
              postalCode: data.postalCode,
              city: data.city,
              gender: data.gender,
              facultyId: data.facultyId || null,
              facultyOther: data.facultyOther || null,
              phone: data.phone,
              privateEmail: data.privateEmail,
              privateEmailVerified: !data.ksetEmail,
              ksetEmail: data.ksetEmail,
              ksetEmailVerified: Boolean(data.ksetEmail),
              memberSince: new Date(),
              cardNumber: data.cardNumber || null,
              membershipLevel: data.membershipLevel,
              fullMemberSince: data.fullMemberSince ? new Date(data.fullMemberSince) : null,
              homeSectionId: data.homeSectionId,
              dietType: data.dietType,
              shirtSize: data.shirtSize,
              transportVolunteer: Boolean(data.transportVolunteer),
              acceptedDocuments: data.acceptedDocuments,
              referralSource: data.referralSource,
              certificatePath: data.certificatePath || null,
              certificateValidUntil: data.certificatePath ? nextCertificateValidUntil() : null,
              certificateApprovedAt: data.certificatePath ? new Date() : null,
              appRole: 'CLAN',
              sections: {
                create: (data.sectionIds || []).map((sectionId) => ({ sectionId })),
              },
              teams: {
                create: (data.teamIds || []).map((teamId) => ({ teamId })),
              },
              drinks: {
                create: (data.drinkIds || []).map((drinkId) => ({ drinkId })),
              },
              allergies: {
                create: (data.allergyIds || []).map((allergyId) => ({ allergyId })),
              },
            },
          });
        }

        const removed = await tx.pendingMember.deleteMany({
          where: { id: pendingId, status: 'PENDING', updatedAt: pending.updatedAt },
        });
        if (removed.count !== 1) throw new Error('Prijava je već obrađena.');
        return savedMember;
      });

      await logAction(prisma, 'pending_application_approved', {
        userId: memberId,
        details: {
          pendingId,
          memberId: member.id,
          existingMember: Boolean(existingMember),
          googleEmail: pending.googleEmail,
        },
      });

      return res.json({
        status: 'approved',
        message: existingMember ? 'Podatci postojećeg člana su ažurirani.' : 'Član je prihvaćen.',
        member,
      });
    } else {
      const updatedFieldData = { ...fieldData };
      const updatedFieldStatus = { ...fieldStatus };
      let rejectedCertificate = null;

      for (const [field, status] of Object.entries(fieldStatus)) {
        if (status === 'REJECTED') {
          if (field === 'certificatePath' && updatedFieldData.certificatePath) {
            rejectedCertificate = updatedFieldData.certificatePath;
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

      const saved = await prisma.pendingMember.updateMany({
        where: { id: pendingId, status: 'PENDING', updatedAt: pending.updatedAt },
        data: {
          fieldData: updatedFieldData,
          fieldStatus: updatedFieldStatus,
        },
      });
      if (saved.count !== 1) {
        return res.status(409).json({ error: 'Prijavu je u međuvremenu pregledao drugi korisnik. Osvježite prikaz.' });
      }
      if (rejectedCertificate) await deletePendingCertificate(rejectedCertificate);

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
    if (err.code === 'PENDING_MEMBER_IDENTITY_CONFLICT') {
      return res.status(409).json({ error: err.message });
    }
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
