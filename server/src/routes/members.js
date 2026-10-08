const express = require('express');
const prisma = require('../lib/prisma');
const { authenticateToken } = require('../middleware/auth');
const { verifyCurrentRole } = require('../middleware/verifyRole');
const { hasAdminRole } = require('../middleware/authorize');
const { logAction, logError } = require('../utils/auditLog');
const { parsePositiveIntParam, validateIdArray, checkFieldLength } = require('../utils/requestValidation');
const { isEmailTaken } = require('../utils/emailUnique');
const { deleteCertificate } = require('./uploads');
const { REFERRAL_SOURCE_OPTIONS } = require('../utils/referralSources');
const { createMembersWorkbook } = require('../utils/memberExport');

const router = express.Router();

const LOCKED_FIELDS = ['oib', 'dateOfBirth', 'cardNumber', 'memberSince', 'discordId'];
const CERTIFICATE_FIELDS = ['certificatePath', 'certificateValidUntil'];
const MAX_LEADERS_PER_SECTION = 2;

const EDITABLE_SCALAR_FIELDS = [
  'firstName',
  'lastName',
  'address',
  'houseNumber',
  'postalCode',
  'city',
  'gender',
  'phone',
  'privateEmail',
  'fullMemberSince',
  'dietType',
  'shirtSize',
  'transportVolunteer',
];

// Admins can edit everything a member can, plus identity/card fields and
// membership level. The joining date is historical/statistical and remains
// server-managed; certificate fields use the dedicated upload flow.
const ADMIN_EDITABLE_SCALAR_FIELDS = [
  ...EDITABLE_SCALAR_FIELDS,
  'oib',
  'dateOfBirth',
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

    if ('membershipLevel' in body) {
      return res.status(400).json({ error: 'Razinu članstva može mijenjati samo administrator ili voditelj sekcije.' });
    }

    const data = {};
    for (const field of EDITABLE_SCALAR_FIELDS) {
      if (field in body) {
        if (field === 'transportVolunteer') {
          if (typeof body[field] !== 'boolean') {
            return res.status(400).json({ error: 'Nevažeći odabir prijevoza.' });
          }
          data[field] = body[field];
          continue;
        }
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
      if (new Set(result.ids).size !== result.ids.length) {
        return res.status(400).json({ error: 'Pridružene sekcije sadrže duplikate.' });
      }
      const currentMember = await prisma.member.findUnique({
        where: { id: memberId },
        select: {
          homeSectionId: true,
          membershipLevel: true,
          sections: { select: { sectionId: true } },
        },
      });
      if (currentMember && result.ids.includes(currentMember.homeSectionId)) {
        return res.status(400).json({ error: 'Matična sekcija ne može biti i pridružena sekcija.' });
      }
      if (currentMember?.membershipLevel === 'PRIDRUZENO') {
        const existingSectionIds = new Set(currentMember.sections.map((section) => section.sectionId));
        const addedSectionIds = result.ids.filter((id) => !existingSectionIds.has(id));
        if (addedSectionIds.length > 0) {
          const mediaSection = await prisma.section.findUnique({
            where: { name: 'Media' },
            select: { id: true },
          });
          if (!mediaSection || addedSectionIds.some((id) => id !== mediaSection.id)) {
            return res.status(400).json({
              error: 'Plavi članovi mogu odabrati samo Mediju kao novu pridruženu sekciju.',
            });
          }
        }
      }
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
    });
  } catch (err) {
    await logError(prisma, 'member_profile_update', err, { userId: req.user.memberId });
    res.status(500).json({ error: 'Greška na serveru.' });
  }
});

router.patch('/:id/management', authenticateToken, verifyCurrentRole, async (req, res) => {
  try {
    const { appRole, memberId } = req.user;
    if (!hasAdminRole(appRole) && appRole !== 'VODITELJ_SEKCIJE') {
      return res.status(403).json({ error: 'Nemate ovlasti.' });
    }

    const targetId = parsePositiveIntParam(req.params.id);
    if (targetId === null) return res.status(400).json({ error: 'Nevažeći ID člana.' });

    const target = await prisma.member.findUnique({
      where: { id: targetId },
      select: {
        id: true,
        homeSectionId: true,
        membershipLevel: true,
        sections: { select: { sectionId: true } },
      },
    });
    if (!target) return res.status(404).json({ error: 'Član nije pronađen.' });

    if (appRole === 'VODITELJ_SEKCIJE') {
      const leader = await prisma.member.findUnique({ where: { id: memberId }, select: { managedSectionId: true } });
      const sectionId = leader?.managedSectionId;
      if (!sectionId || target.homeSectionId !== sectionId) {
        return res.status(403).json({ error: 'Možete uređivati samo članove čija je matična sekcija vaša sekcija.' });
      }
    }

    const data = {};
    if ('membershipLevel' in req.body) {
      if (!['PRIDRUZENO', 'PUNOPRAVNO', 'POCASNO', 'STARO'].includes(req.body.membershipLevel)) {
        return res.status(400).json({ error: 'Nevažeća razina članstva.' });
      }
      data.membershipLevel = req.body.membershipLevel;
    }
    if ('cardNumber' in req.body) {
      const cardNumber = typeof req.body.cardNumber === 'string' ? req.body.cardNumber.trim() : '';
      const lengthError = checkFieldLength('cardNumber', cardNumber);
      if (lengthError) return res.status(400).json({ error: lengthError });
      if (cardNumber) {
        data.cardNumber = cardNumber;
      } else {
        data.cardNumber = null;
      }
    }

    const relationUpdates = {};
    if ('sectionIds' in req.body) {
      const result = validateIdArray(req.body.sectionIds, 'sectionIds');
      if (!result.ok) return res.status(400).json({ error: result.error });
      if (new Set(result.ids).size !== result.ids.length) {
        return res.status(400).json({ error: 'Pridružene sekcije sadrže duplikate.' });
      }
      if (result.ids.includes(target.homeSectionId)) {
        return res.status(400).json({ error: 'Matična sekcija ne može biti i pridružena sekcija.' });
      }

      const existingSectionIds = new Set(target.sections.map(({ sectionId }) => sectionId));
      const addedSectionIds = result.ids.filter((id) => !existingSectionIds.has(id));
      if (target.membershipLevel === 'PRIDRUZENO' && addedSectionIds.length > 0) {
        const mediaSection = await prisma.section.findUnique({
          where: { name: 'Media' },
          select: { id: true },
        });
        if (!mediaSection || addedSectionIds.some((id) => id !== mediaSection.id)) {
          return res.status(400).json({
            error: 'Plavi članovi mogu odabrati samo Mediju kao novu pridruženu sekciju.',
          });
        }
      }

      const existingSections = await prisma.section.findMany({
        where: { id: { in: result.ids } },
        select: { id: true },
      });
      if (existingSections.length !== result.ids.length) {
        return res.status(400).json({ error: 'Jedna ili više odabranih sekcija ne postoje.' });
      }

      relationUpdates.sections = {
        deleteMany: {},
        create: result.ids.map((id) => ({ sectionId: id })),
      };
    }
    if (!Object.keys(data).length && !Object.keys(relationUpdates).length) {
      return res.status(400).json({ error: 'Nema podataka za spremanje.' });
    }

    const updated = await prisma.member.update({
      where: { id: targetId },
      data: { ...data, ...relationUpdates },
      include: { sections: { include: { section: true } } },
    });
    await logAction(prisma, 'member_management_fields_updated', {
      userId: memberId,
      details: {
        targetId,
        updatedFields: [...Object.keys(data), ...Object.keys(relationUpdates)],
      },
    });
    res.json(updated);
  } catch (err) {
    await logError(prisma, 'member_management_fields_update', err, { userId: req.user.memberId });
    res.status(500).json({ error: 'Greška na serveru.' });
  }
});

// Slim by design: the list view only ever renders name/email/phone/section,
// so that's all this returns - full PII (OIB, address, diet, allergies...)
// is only fetched per-member via GET /:id when someone actually opens a
// detail page. Keeps the list fast and keeps sensitive fields off the wire
// for rows nobody clicks into.
const LIST_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  dateOfBirth: true,
  ksetEmail: true,
  privateEmail: true,
  cardNumber: true,
  membershipLevel: true,
  certificateApprovedAt: true,
  certificateValidUntil: true,
  phone: true,
  faculty: { select: { name: true } },
  facultyOther: true,
  homeSectionId: true,
  homeSection: { select: { id: true, name: true } },
  sections: { select: { sectionId: true } },
  appRole: true,
};

function toListItem(m, limited) {
  return {
    id: m.id,
    firstName: m.firstName,
    lastName: m.lastName,
    birthYear: m.dateOfBirth?.getUTCFullYear() ?? null,
    ksetEmail: m.ksetEmail,
    privateEmail: m.privateEmail,
    cardNumber: m.cardNumber,
    membershipLevel: m.membershipLevel,
    certificateApprovedAt: m.certificateApprovedAt,
    certificateValidUntil: m.certificateValidUntil,
    phone: m.phone,
    facultyName: m.faculty?.name || m.facultyOther || '',
    homeSection: m.homeSection,
    isCouncilMember: [
      'VODITELJ_SEKCIJE',
      'ADMINISTRATOR',
      'NADZORNI',
      'SANKER',
      'VODITELJ_PROGRAMA',
    ].includes(m.appRole),
    limited,
  };
}

router.get('/export', authenticateToken, verifyCurrentRole, async (req, res) => {
  try {
    const { appRole, memberId, managedSectionId } = req.user;
    if (!hasAdminRole(appRole) && appRole !== 'VODITELJ_SEKCIJE') {
      return res.status(403).json({ error: 'Nemate ovlasti.' });
    }

    if (appRole === 'VODITELJ_SEKCIJE' && !managedSectionId) {
      return res.status(403).json({ error: 'Niste voditelj nijedne sekcije.' });
    }

    const section = appRole === 'VODITELJ_SEKCIJE'
      ? await prisma.section.findUnique({
        where: { id: managedSectionId },
        select: { id: true, name: true },
      })
      : null;
    if (appRole === 'VODITELJ_SEKCIJE' && !section) {
      return res.status(403).json({ error: 'Sekcija koju vodite nije pronađena.' });
    }

    const members = await prisma.member.findMany({
      where: section
        ? {
          OR: [
            { homeSectionId: section.id },
            { sections: { some: { sectionId: section.id } } },
          ],
        }
        : undefined,
      include: {
        faculty: true,
        homeSection: true,
        managedSection: true,
        sections: { include: { section: true } },
        teams: { include: { team: true } },
        drinks: { include: { drink: true } },
        allergies: { include: { allergy: true } },
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });
    const buffer = await createMembersWorkbook(members);
    const sectionSlug = section ? `${section.name.toLowerCase()}-` : '';
    const filename = `kset-${sectionSlug}clanovi-${new Date().toISOString().slice(0, 10)}.xlsx`;

    await logAction(prisma, section ? 'section_members_exported' : 'members_exported', {
      userId: memberId,
      details: { memberCount: members.length, sectionId: section?.id ?? null },
    });

    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    });
    res.send(Buffer.from(buffer));
  } catch (err) {
    await logError(prisma, 'members_export', err, { userId: req.user.memberId });
    res.status(500).json({ error: 'Greška pri izvozu članova.' });
  }
});

router.get('/', authenticateToken, verifyCurrentRole, async (req, res) => {
  try {
    const { appRole, memberId } = req.user;

    if (!hasAdminRole(appRole) && appRole !== 'VODITELJ_SEKCIJE') {
      return res.status(403).json({ error: 'Nemate ovlasti.' });
    }

    const allMembers = await prisma.member.findMany({
      select: LIST_SELECT,
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });

    if (hasAdminRole(appRole)) {
      return res.json(allMembers.map((m) => toListItem(m, false)));
    }

    if (['SANKER', 'VODITELJ_PROGRAMA'].includes(appRole)) {
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
      return {
        ...toListItem(m, !(isHome || isAssociated)),
        isHomeSectionMember: isHome,
        isManagedSectionMember: isHome || isAssociated,
        managedSectionId: sid,
      };
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
    if (!hasAdminRole(appRole)) {
      return res.status(403).json({ error: 'Nemate ovlasti.' });
    }

    const [members, allSections] = await Promise.all([
      prisma.member.findMany({
        select: {
          shirtSize: true,
          dietType: true,
          referralSource: true,
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
      byReferralSource: (() => {
        const counts = new Map(tally(members, (m) => m.referralSource).map(({ label, value }) => [label, value]));
        return [
          ...REFERRAL_SOURCE_OPTIONS.map((label) => ({ label, value: counts.get(label) || 0 })),
          { label: 'Nije navedeno', value: counts.get('Nije navedeno') || members.filter((m) => !m.referralSource).length },
        ];
      })(),
    });
  } catch (err) {
    console.error('Get member stats error:', err);
    res.status(500).json({ error: 'Greška na serveru.' });
  }
});

// Full profile for one member, fetched on demand when a detail page opens.
// Section leaders may view all member details, but may manage membership only
// when the member's home section is theirs. Must stay after /me and /stats.
router.get('/:id', authenticateToken, verifyCurrentRole, async (req, res) => {
  try {
    const { appRole, memberId } = req.user;

    if (!hasAdminRole(appRole) && appRole !== 'VODITELJ_SEKCIJE') {
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

    if (['SANKER', 'VODITELJ_PROGRAMA'].includes(appRole)) {
      return res.json({ ...target, limited: false, canManageMembership: false });
    }

    if (hasAdminRole(appRole)) {
      return res.json({ ...target, limited: false, canManageMembership: true });
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

    res.json({
      ...target,
      limited: false,
      canManageMembership: isHome,
    });
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
    if (!hasAdminRole(appRole)) {
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
      if (field === 'transportVolunteer') {
        if (typeof body[field] !== 'boolean') {
          return res.status(400).json({ error: 'Nevažeći odabir prijevoza.' });
        }
        data[field] = body[field];
        continue;
      }
      if (field === 'fullMemberSince' || field === 'dateOfBirth' || field === 'memberSince') {
        data[field] = body[field] ? new Date(body[field]) : field === 'fullMemberSince' ? null : undefined;
        if (data[field] === undefined || (data[field] && Number.isNaN(data[field].getTime()))) {
          return res.status(400).json({ error: `Polje "${field}" nije ispravan datum.` });
        }
      } else {
        const val = body[field];
        if (field === 'cardNumber') {
          const cardNumber = typeof val === 'string' ? val.trim() : '';
          const lengthError = checkFieldLength(field, cardNumber);
          if (lengthError) return res.status(400).json({ error: lengthError });
          data[field] = cardNumber || null;
          continue;
        }
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
      if (new Set(result.ids).size !== result.ids.length) {
        return res.status(400).json({ error: 'Pridružene sekcije sadrže duplikate.' });
      }
      const homeSectionId = data.homeSectionId ?? target.homeSectionId;
      if (result.ids.includes(homeSectionId)) {
        return res.status(400).json({ error: 'Matična sekcija ne može biti i pridružena sekcija.' });
      }
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

// Admins may delete any member; section leaders may delete members of their section.
router.delete('/:id', authenticateToken, verifyCurrentRole, async (req, res) => {
  try {
    const { appRole, memberId: actorId } = req.user;
    if (!hasAdminRole(appRole) && appRole !== 'VODITELJ_SEKCIJE') {
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

    if (appRole === 'VODITELJ_SEKCIJE') {
      if (targetId === actorId || hasAdminRole(target.appRole)) {
        return res.status(403).json({ error: 'Nemate ovlasti izbrisati ovog člana.' });
      }

      const leader = await prisma.member.findUnique({
        where: { id: actorId },
        select: { managedSectionId: true },
      });
      if (!leader?.managedSectionId || target.homeSectionId !== leader.managedSectionId) {
        return res.status(403).json({
          error: 'Možete brisati samo članove čija je matična sekcija vaša sekcija.',
        });
      }
    }

    if (hasAdminRole(target.appRole)) {
      const adminCount = await prisma.member.count({
        where: { appRole: { in: ['ADMINISTRATOR', 'NADZORNI'] } },
      });
      if (adminCount <= 1) {
        return res.status(400).json({ error: 'Mora postojati barem jedan administrator ili nadzorni.' });
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

    if (!hasAdminRole(actorRole)) {
      return res.status(403).json({ error: 'Samo administrator može mijenjati uloge.' });
    }

    const targetId = parsePositiveIntParam(req.params.id);
    if (targetId === null) {
      return res.status(400).json({ error: 'Nevažeći ID člana.' });
    }
    const { appRole, managedSectionId } = req.body;

    if (!['CLAN', 'VODITELJ_SEKCIJE', 'ADMINISTRATOR', 'NADZORNI', 'SANKER', 'VODITELJ_PROGRAMA'].includes(appRole)) {
      return res.status(400).json({ error: 'Nevažeća uloga.' });
    }

    const target = await prisma.member.findUnique({ where: { id: targetId } });
    if (!target) {
      return res.status(404).json({ error: 'Član nije pronađen.' });
    }

    if (hasAdminRole(target.appRole) && !hasAdminRole(appRole)) {
      const adminCount = await prisma.member.count({
        where: { appRole: { in: ['ADMINISTRATOR', 'NADZORNI'] } },
      });
      if (adminCount <= 1) {
        return res.status(400).json({ error: 'Mora postojati barem jedan administrator ili nadzorni.' });
      }
    }

    let newManagedSectionId = null;

    if (appRole === 'VODITELJ_SEKCIJE') {
      newManagedSectionId = parsePositiveIntParam(managedSectionId);
      if (newManagedSectionId === null) {
        return res.status(400).json({ error: 'Odaberite sekciju koju voditelj vodi.' });
      }

      const existingLeaders = await prisma.member.findMany({
        where: {
          appRole: 'VODITELJ_SEKCIJE',
          managedSectionId: newManagedSectionId,
          id: { not: targetId },
        },
      });
      if (existingLeaders.length >= MAX_LEADERS_PER_SECTION) {
        const names = existingLeaders.map((l) => `${l.firstName} ${l.lastName}`).join(', ');
        return res.status(400).json({
          error: `Sekcija već ima ${MAX_LEADERS_PER_SECTION} voditelja (${names}). Prvo skinite jednog od njih.`,
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
      details: {
        targetId,
        newRole: appRole,
        managedSectionId: newManagedSectionId,
      },
    });

    res.json({
      id: updated.id,
      appRole: updated.appRole,
      managedSectionId: updated.managedSectionId,
    });
  } catch (err) {
    await logError(prisma, 'member_role_change', err, { userId: req.user.memberId, details: { targetId: req.params.id } });
    res.status(500).json({ error: 'Greška na serveru.' });
  }
});


module.exports = router;
