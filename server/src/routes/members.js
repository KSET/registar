const express = require('express');
const prisma = require('../lib/prisma');
const { authenticateToken } = require('../middleware/auth');
const { verifyCurrentRole } = require('../middleware/verifyRole');
const { logAction, logError } = require('../utils/auditLog');
const { parsePositiveIntParam, validateIdArray, checkFieldLength } = require('../utils/requestValidation');
const { isEmailTaken } = require('../utils/emailUnique');
const { deleteCertificate } = require('./uploads');

const router = express.Router();

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

// Admins can edit everything a member can, plus the fields normally locked
// for self-service (oib/dateOfBirth/cardNumber/memberSince) and the
// membership level directly (no pending-approval detour - the admin IS the
// approver). Certificate fields still go through the dedicated upload flow.
const ADMIN_EDITABLE_SCALAR_FIELDS = [
  ...EDITABLE_SCALAR_FIELDS,
  'oib',
  'dateOfBirth',
  'memberSince',
  'cardNumber',
  'membershipLevel',
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
          const lengthError = checkFieldLength(field, val);
          if (lengthError) {
            return res.status(400).json({ error: lengthError });
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
      const facultyOtherLengthError = checkFieldLength('facultyOther', fother);
      if (facultyOtherLengthError) {
        return res.status(400).json({ error: facultyOtherLengthError });
      }
      data.facultyId = fid;
      data.facultyOther = fother;
    }

    if ('gender' in data && !['M', 'Z', 'OSTALO'].includes(data.gender)) {
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
        const { isEmailTaken } = require('../utils/emailUnique');
        if (await isEmailTaken(data.privateEmail, memberId)) {
          return res.status(400).json({ error: 'Taj e-mail je već u upotrebi.' });
        }
        data.privateEmailVerified = false;
      }

    }

    const relationUpdates = {};
    if ('sectionIds' in body) {
      const result = validateIdArray(body.sectionIds, 'sectionIds');
      if (!result.ok) return res.status(400).json({ error: result.error });
      relationUpdates.sections = {
        deleteMany: {},
        create: result.ids.map((id) => ({ sectionId: id })),
      };
    }
    if ('teamIds' in body) {
      const result = validateIdArray(body.teamIds, 'teamIds');
      if (!result.ok) return res.status(400).json({ error: result.error });
      relationUpdates.teams = {
        deleteMany: {},
        create: result.ids.map((id) => ({ teamId: id })),
      };
    }
    if ('drinkIds' in body) {
      const result = validateIdArray(body.drinkIds, 'drinkIds');
      if (!result.ok) return res.status(400).json({ error: result.error });
      if (result.ids.length === 0) {
        return res.status(400).json({ error: 'Morate odabrati barem jedno piće.' });
      }
      relationUpdates.drinks = {
        deleteMany: {},
        create: result.ids.map((id) => ({ drinkId: id })),
      };
    }
    if ('allergyIds' in body) {
      const result = validateIdArray(body.allergyIds, 'allergyIds');
      if (!result.ok) return res.status(400).json({ error: result.error });
      relationUpdates.allergies = {
        deleteMany: {},
        create: result.ids.map((id) => ({ allergyId: id })),
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

function toLimited(m) {
  return {
    id: m.id,
    firstName: m.firstName,
    lastName: m.lastName,
    ksetEmail: m.ksetEmail,
    privateEmail: m.privateEmail,
    phone: m.phone,
    homeSection: m.homeSection,
    limited: true,
  };
}

// Slim by design: the list view only ever renders name/email/phone/section,
// so that's all this returns - full PII (OIB, address, diet, allergies...)
// is only fetched per-member via GET /:id when someone actually opens a
// detail page. Keeps the list fast and keeps sensitive fields off the wire
// for rows nobody clicks into.
const LIST_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  ksetEmail: true,
  privateEmail: true,
  phone: true,
  homeSectionId: true,
  homeSection: { select: { id: true, name: true } },
  sections: { select: { sectionId: true } },
};

function toListItem(m, limited) {
  return {
    id: m.id,
    firstName: m.firstName,
    lastName: m.lastName,
    ksetEmail: m.ksetEmail,
    privateEmail: m.privateEmail,
    phone: m.phone,
    homeSection: m.homeSection,
    limited,
  };
}

router.get('/', authenticateToken, verifyCurrentRole, async (req, res) => {
  try {
    const { appRole, memberId } = req.user;

    if (!appRole || appRole === 'CLAN') {
      return res.status(403).json({ error: 'Nemate ovlasti.' });
    }

    const allMembers = await prisma.member.findMany({
      select: LIST_SELECT,
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });

    if (appRole === 'ADMINISTRATOR') {
      return res.json(allMembers.map((m) => toListItem(m, false)));
    }

    const leader = await prisma.member.findUnique({
      where: { id: memberId },
      select: { managedSectionId: true },
    });

    if (!leader || !leader.managedSectionId) {
      return res.status(403).json({ error: 'Niste voditelj nijedne sekcije.' });
    }

    const sid = leader.managedSectionId;

    const result = allMembers.map((m) => {
      const isHome = m.homeSectionId === sid;
      const isAssociated = m.sections.some((s) => s.sectionId === sid);
      return toListItem(m, !(isHome || isAssociated));
    });

    res.json(result);
  } catch (err) {
    console.error('Get members error:', err);
    res.status(500).json({ error: 'Greška na serveru.' });
  }
});

// Aggregated counts for the admin dashboard's pie charts.
router.get('/stats', authenticateToken, verifyCurrentRole, async (req, res) => {
  try {
    const { appRole } = req.user;
    if (appRole !== 'ADMINISTRATOR') {
      return res.status(403).json({ error: 'Nemate ovlasti.' });
    }

    const [members, allSections] = await Promise.all([
      prisma.member.findMany({
        select: {
          shirtSize: true,
          dietType: true,
          membershipLevel: true,
          homeSection: { select: { name: true } },
          faculty: { select: { name: true } },
          facultyOther: true,
          teams: { select: { team: { select: { name: true } } } },
        },
      }),
      prisma.section.findMany({ select: { name: true }, orderBy: { name: 'asc' } }),
    ]);

    const tally = (items, keyFn) => {
      const map = new Map();
      for (const item of items) {
        const key = keyFn(item);
        if (key === null || key === undefined) continue;
        map.set(key, (map.get(key) || 0) + 1);
      }
      return [...map.entries()]
        .map(([label, value]) => ({ label, value }))
        .sort((a, b) => b.value - a.value);
    };

    const facultyLabel = (m) => m.faculty?.name || m.facultyOther || 'Nepoznato';

    const teamCounts = new Map();
    for (const m of members) {
      for (const t of m.teams) {
        teamCounts.set(t.team.name, (teamCounts.get(t.team.name) || 0) + 1);
      }
    }
    const byTeam = [...teamCounts.entries()]
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value);

    const byFacultyForLevel = (level) =>
      tally(members.filter((m) => m.membershipLevel === level), facultyLabel);

    // Every section shown, including ones with zero members right now -
    // this is a fixed lookup list, not derived purely from who's in it.
    const sectionCounts = tally(members, (m) => m.homeSection?.name);
    const sectionCountMap = new Map(sectionCounts.map((s) => [s.label, s.value]));
    const bySection = allSections
      .map((s) => ({ label: s.name, value: sectionCountMap.get(s.name) || 0 }))
      .sort((a, b) => b.value - a.value);

    res.json({
      total: members.length,
      bySection,
      byFaculty: tally(members, facultyLabel),
      byShirtSize: tally(members, (m) => m.shirtSize),
      byTeam,
      byMembershipLevel: tally(members, (m) => m.membershipLevel),
      // "Card colour" breakdowns: narančasti (orange) = PUNOPRAVNO, plavi (blue) = PRIDRUZENO.
      byFacultyPunopravno: byFacultyForLevel('PUNOPRAVNO'),
      byFacultyPridruzeno: byFacultyForLevel('PRIDRUZENO'),
      byDiet: tally(members, (m) => m.dietType),
    });
  } catch (err) {
    console.error('Get member stats error:', err);
    res.status(500).json({ error: 'Greška na serveru.' });
  }
});

// Full profile for one member, fetched on demand when a detail page opens -
// same visibility rule as the list (admin: everyone; leader: full detail
// only for their own section, limited fields otherwise). Must stay after
// /me and /stats above (both static paths /:id would otherwise swallow).
router.get('/:id', authenticateToken, verifyCurrentRole, async (req, res) => {
  try {
    const { appRole, memberId } = req.user;

    if (!appRole || appRole === 'CLAN') {
      return res.status(403).json({ error: 'Nemate ovlasti.' });
    }

    const targetId = parsePositiveIntParam(req.params.id);
    if (targetId === null) {
      return res.status(400).json({ error: 'Nevažeći ID člana.' });
    }

    const target = await prisma.member.findUnique({
      where: { id: targetId },
      include: {
        homeSection: true,
        faculty: true,
        sections: { include: { section: true } },
        teams: { include: { team: true } },
        drinks: { include: { drink: true } },
        allergies: { include: { allergy: true } },
      },
    });

    if (!target) {
      return res.status(404).json({ error: 'Član nije pronađen.' });
    }

    if (appRole === 'ADMINISTRATOR') {
      return res.json({ ...target, limited: false });
    }

    const leader = await prisma.member.findUnique({
      where: { id: memberId },
      select: { managedSectionId: true },
    });

    if (!leader || !leader.managedSectionId) {
      return res.status(403).json({ error: 'Niste voditelj nijedne sekcije.' });
    }

    const sid = leader.managedSectionId;
    const isHome = target.homeSectionId === sid;
    const isAssociated = target.sections.some((s) => s.sectionId === sid);

    if (isHome || isAssociated) {
      return res.json({ ...target, limited: false });
    }
    res.json(toLimited(target));
  } catch (err) {
    console.error('Get member detail error:', err);
    res.status(500).json({ error: 'Greška na serveru.' });
  }
});

// Admin-only: edit any member's full profile directly (no pending-approval
// detour - the admin already IS the approver). Role/managedSection changes
// stay on the dedicated /:id/role route below.
router.patch('/:id', authenticateToken, verifyCurrentRole, async (req, res) => {
  try {
    const { appRole } = req.user;
    if (appRole !== 'ADMINISTRATOR') {
      return res.status(403).json({ error: 'Nemate ovlasti.' });
    }

    const targetId = parsePositiveIntParam(req.params.id);
    if (targetId === null) {
      return res.status(400).json({ error: 'Nevažeći ID člana.' });
    }

    const target = await prisma.member.findUnique({ where: { id: targetId } });
    if (!target) {
      return res.status(404).json({ error: 'Član nije pronađen.' });
    }

    const body = req.body;
    for (const field of CERTIFICATE_FIELDS) {
      if (field in body) {
        return res.status(400).json({ error: 'Potvrda o studiranju se mijenja kroz zaseban upload.' });
      }
    }

    const data = {};
    for (const field of ADMIN_EDITABLE_SCALAR_FIELDS) {
      if (!(field in body)) continue;
      if (field === 'fullMemberSince' || field === 'dateOfBirth' || field === 'memberSince') {
        data[field] = body[field] ? new Date(body[field]) : field === 'fullMemberSince' ? null : undefined;
        if (data[field] === undefined || (data[field] && Number.isNaN(data[field].getTime()))) {
          return res.status(400).json({ error: `Polje "${field}" nije ispravan datum.` });
        }
      } else {
        const val = body[field];
        if (typeof val === 'string' && !val.trim()) {
          return res.status(400).json({ error: `Polje "${field}" ne smije biti prazno.` });
        }
        const lengthError = checkFieldLength(field, val);
        if (lengthError) return res.status(400).json({ error: lengthError });
        data[field] = typeof val === 'string' ? val.trim() : val;
      }
    }

    if ('gender' in data && !['M', 'Z', 'OSTALO'].includes(data.gender)) {
      return res.status(400).json({ error: 'Nevažeći spol.' });
    }
    if ('dietType' in data && !['MESOJED', 'VEGETARIJANSTVO', 'VEGANSTVO', 'SVEJED'].includes(data.dietType)) {
      return res.status(400).json({ error: 'Nevažeći tip prehrane.' });
    }
    if ('membershipLevel' in data && !['PRIDRUZENO', 'PUNOPRAVNO', 'POCASNO', 'STARO'].includes(data.membershipLevel)) {
      return res.status(400).json({ error: 'Nevažeća razina članstva.' });
    }
    if ('oib' in data) {
      const { isValidOib } = require('../utils/oib');
      if (!isValidOib(data.oib)) return res.status(400).json({ error: 'OIB nije ispravan.' });
      const oibOwner = await prisma.member.findFirst({ where: { oib: data.oib, id: { not: targetId } } });
      if (oibOwner) return res.status(400).json({ error: 'Taj OIB je već u upotrebi.' });
    }
    if ('cardNumber' in data) {
      const cardOwner = await prisma.member.findFirst({ where: { cardNumber: data.cardNumber, id: { not: targetId } } });
      if (cardOwner) return res.status(400).json({ error: 'Ta šifra iskaznice je već u upotrebi.' });
    }
    if ('privateEmail' in data) {
      if (!/^\S+@\S+\.\S+$/.test(data.privateEmail)) {
        return res.status(400).json({ error: 'Nevažeći format privatnog e-maila.' });
      }
      if (await isEmailTaken(data.privateEmail, targetId)) {
        return res.status(400).json({ error: 'Taj e-mail je već u upotrebi.' });
      }
      if (data.privateEmail !== target.privateEmail) {
        data.privateEmailVerified = false;
      }
    }

    if ('facultyId' in body || 'facultyOther' in body) {
      const fid = body.facultyId ? parseInt(body.facultyId) : null;
      const fother = body.facultyOther ? String(body.facultyOther).trim() : null;
      if (!fid && !fother) {
        return res.status(400).json({ error: 'Fakultet je obavezan.' });
      }
      const facultyOtherLengthError = checkFieldLength('facultyOther', fother);
      if (facultyOtherLengthError) return res.status(400).json({ error: facultyOtherLengthError });
      data.facultyId = fid;
      data.facultyOther = fother;
    }

    if ('homeSectionId' in body) {
      const hsid = parsePositiveIntParam(body.homeSectionId);
      if (hsid === null) return res.status(400).json({ error: 'Nevažeća matična sekcija.' });
      data.homeSectionId = hsid;
    }

    const relationUpdates = {};
    if ('sectionIds' in body) {
      const result = validateIdArray(body.sectionIds, 'sectionIds');
      if (!result.ok) return res.status(400).json({ error: result.error });
      relationUpdates.sections = { deleteMany: {}, create: result.ids.map((id) => ({ sectionId: id })) };
    }
    if ('teamIds' in body) {
      const result = validateIdArray(body.teamIds, 'teamIds');
      if (!result.ok) return res.status(400).json({ error: result.error });
      relationUpdates.teams = { deleteMany: {}, create: result.ids.map((id) => ({ teamId: id })) };
    }
    if ('drinkIds' in body) {
      const result = validateIdArray(body.drinkIds, 'drinkIds');
      if (!result.ok) return res.status(400).json({ error: result.error });
      relationUpdates.drinks = { deleteMany: {}, create: result.ids.map((id) => ({ drinkId: id })) };
    }
    if ('allergyIds' in body) {
      const result = validateIdArray(body.allergyIds, 'allergyIds');
      if (!result.ok) return res.status(400).json({ error: result.error });
      relationUpdates.allergies = { deleteMany: {}, create: result.ids.map((id) => ({ allergyId: id })) };
    }

    const updated = await prisma.member.update({
      where: { id: targetId },
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

    await logAction(prisma, 'member_edited_by_admin', {
      userId: req.user.memberId,
      details: { targetId, updatedFields: Object.keys(data), relationsUpdated: Object.keys(relationUpdates) },
    });

    res.json(updated);
  } catch (err) {
    if (err.code === 'P2002') {
      return res.status(409).json({ error: 'Podatak se dupliciran (OIB, e-mail ili šifra iskaznice).' });
    }
    await logError(prisma, 'member_admin_edit', err, { userId: req.user.memberId, details: { targetId: req.params.id } });
    res.status(500).json({ error: 'Greška na serveru.' });
  }
});

// Admin-only: permanently delete a member.
router.delete('/:id', authenticateToken, verifyCurrentRole, async (req, res) => {
  try {
    const { appRole, memberId: actorId } = req.user;
    if (appRole !== 'ADMINISTRATOR') {
      return res.status(403).json({ error: 'Nemate ovlasti.' });
    }

    const targetId = parsePositiveIntParam(req.params.id);
    if (targetId === null) {
      return res.status(400).json({ error: 'Nevažeći ID člana.' });
    }

    const target = await prisma.member.findUnique({ where: { id: targetId } });
    if (!target) {
      return res.status(404).json({ error: 'Član nije pronađen.' });
    }

    if (target.appRole === 'ADMINISTRATOR') {
      const adminCount = await prisma.member.count({ where: { appRole: 'ADMINISTRATOR' } });
      if (adminCount <= 1) {
        return res.status(400).json({ error: 'Mora postojati barem jedan administrator.' });
      }
    }

    await prisma.member.delete({ where: { id: targetId } });

    if (target.certificatePath) {
      deleteCertificate(target.certificatePath);
    }

    await logAction(prisma, 'member_deleted', {
      userId: actorId,
      details: { targetId, name: `${target.firstName} ${target.lastName}` },
    });

    res.json({ message: 'Član je izbrisan.' });
  } catch (err) {
    await logError(prisma, 'member_delete', err, { userId: req.user.memberId, details: { targetId: req.params.id } });
    res.status(500).json({ error: 'Greška na serveru.' });
  }
});

router.patch('/:id/role', authenticateToken, verifyCurrentRole, async (req, res) => {
  try {
    const { appRole: actorRole, memberId: actorId } = req.user;

    if (actorRole !== 'ADMINISTRATOR') {
      return res.status(403).json({ error: 'Samo administrator može mijenjati uloge.' });
    }

    const targetId = parsePositiveIntParam(req.params.id);
    if (targetId === null) {
      return res.status(400).json({ error: 'Nevažeći ID člana.' });
    }
    const { appRole, managedSectionId } = req.body;

    if (!['CLAN', 'VODITELJ_SEKCIJE', 'ADMINISTRATOR'].includes(appRole)) {
      return res.status(400).json({ error: 'Nevažeća uloga.' });
    }

    const target = await prisma.member.findUnique({ where: { id: targetId } });
    if (!target) {
      return res.status(404).json({ error: 'Član nije pronađen.' });
    }

    if (target.appRole === 'ADMINISTRATOR' && appRole !== 'ADMINISTRATOR') {
      const adminCount = await prisma.member.count({ where: { appRole: 'ADMINISTRATOR' } });
      if (adminCount <= 1) {
        return res.status(400).json({ error: 'Mora postojati barem jedan administrator.' });
      }
    }

    let newManagedSectionId = null;

    if (appRole === 'VODITELJ_SEKCIJE') {
      newManagedSectionId = parsePositiveIntParam(managedSectionId);
      if (newManagedSectionId === null) {
        return res.status(400).json({ error: 'Odaberite sekciju koju voditelj vodi.' });
      }

      const existingLeader = await prisma.member.findFirst({
        where: {
          appRole: 'VODITELJ_SEKCIJE',
          managedSectionId: newManagedSectionId,
          id: { not: targetId },
        },
      });
      if (existingLeader) {
        return res.status(400).json({
          error: `Sekcija već ima voditelja (${existingLeader.firstName} ${existingLeader.lastName}). Prvo ga skinite.`,
        });
      }
    }

    const updated = await prisma.member.update({
      where: { id: targetId },
      data: {
        appRole,
        managedSectionId: newManagedSectionId,
      },
    });

    await logAction(prisma, 'member_role_changed', {
      userId: actorId,
      details: { targetId, newRole: appRole, managedSectionId: newManagedSectionId },
    });

    res.json({ id: updated.id, appRole: updated.appRole, managedSectionId: updated.managedSectionId });
  } catch (err) {
    await logError(prisma, 'member_role_change', err, { userId: req.user.memberId, details: { targetId: req.params.id } });
    res.status(500).json({ error: 'Greška na serveru.' });
  }
});


module.exports = router;
